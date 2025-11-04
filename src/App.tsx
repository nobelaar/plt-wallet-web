import { useCallback, useEffect, useMemo, useState } from 'react'
import { GasPrice, SigningStargateClient, StargateClient } from '@cosmjs/stargate'

import {
  AccountSummary,
  SendTokensForm,
  StoredWalletUnlock,
  WalletImportForm,
  type WalletImportPayload,
} from './components/wallet'
import ConnectView from './components/ConnectView'
import { TabNavigation } from './components/TabNavigation'
import {
  DEFAULT_CHAIN,
  clearPersistedWallet,
  createSignerFromMnemonic,
  createSignerFromPrivateKey,
  decryptSecrets,
  encryptSecrets,
  formatAmount,
  getStoredWallet,
  instantiateSigningClient,
  persistWallet,
  shortenAddress,
} from './lib/wallet'
import type { ActiveWallet, EncryptedWalletShape } from './lib/wallet'
import { DEFAULT_GAS_PRICE, DISPLAY_DENOM } from './config'
import BalancePanel from './components/BalancePanel'
import './App.css'

const tabs = [
  { id: 'connect', label: 'Conexión', description: 'Configurar la red y el RPC' },
  { id: 'wallet', label: 'Wallet', description: 'Importar, desbloquear y ver tu cuenta' },
  { id: 'send', label: 'Enviar', description: 'Transferir tokens y revisar movimientos' },
]

type TabId = (typeof tabs)[number]['id']
type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'plt-wallet-theme'

const resolveInitialTheme = (): ThemeMode => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark'
      }
    } catch {
      // ignore matchMedia errors (e.g., on unsupported platforms)
    }
  }
  return 'light'
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('connect')
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_CHAIN.rpcUrl)
  const [expectedChainId, setExpectedChainId] = useState(DEFAULT_CHAIN.chainId)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [queryClient, setQueryClient] = useState<StargateClient | null>(null)
  const [chainId, setChainId] = useState<string | null>(null)
  const [height, setHeight] = useState(0)
  const [signingClient, setSigningClient] = useState<SigningStargateClient | null>(null)
  const [activeWallet, setActiveWallet] = useState<ActiveWallet | null>(null)
  const [storedWallet, setStoredWallet] = useState<EncryptedWalletShape | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [balance, setBalance] = useState('0')
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())

  const gasPrice = useMemo(() => GasPrice.fromString(DEFAULT_GAS_PRICE), [])

  const isConnected = Boolean(queryClient)
  const displayBalance = useMemo(() => formatAmount(balance), [balance])

  useEffect(() => {
    const payload = getStoredWallet()
    if (payload) {
      setStoredWallet(payload)
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme
      document.documentElement.style.colorScheme = theme
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }, [])

  const disconnectSigningClient = useCallback(async () => {
    if (signingClient) {
      await signingClient.disconnect()
      setSigningClient(null)
    }
  }, [signingClient])

  const refreshBalance = useCallback(async () => {
    if (!signingClient || !activeWallet) return
    try {
      const accountBalance = await signingClient.getBalance(activeWallet.address, DEFAULT_CHAIN.baseDenom)
      setBalance(accountBalance?.amount ?? '0')
    } catch (error) {
      console.error('No se pudo consultar el balance', error)
    }
  }, [activeWallet, signingClient])

  useEffect(() => {
    refreshBalance()
  }, [refreshBalance])

  const handleConnect = useCallback(async () => {
    const trimmedRpc = rpcUrl.trim() || DEFAULT_CHAIN.rpcUrl
    const trimmedChainId = expectedChainId.trim() || DEFAULT_CHAIN.chainId
    setConnectionError(null)

    try {
      const client = await StargateClient.connect(trimmedRpc)
      const remoteChainId = await client.getChainId()
      if (remoteChainId !== trimmedChainId) {
        await client.disconnect()
        throw new Error(`Se esperaba chain-id ${trimmedChainId} pero la red respondió ${remoteChainId}.`)
      }

      const currentHeight = await client.getHeight()

      if (queryClient) {
        await queryClient.disconnect()
      }

      setQueryClient(client)
      setChainId(remoteChainId)
      setHeight(currentHeight)
      setStatusMessage(`Conectado a ${trimmedRpc} (${remoteChainId}).`)
      setActiveTab('wallet')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo conectar con el RPC indicado.'
      setConnectionError(message)
      setQueryClient(null)
      setChainId(null)
      setHeight(0)
    }
  }, [expectedChainId, queryClient, rpcUrl])

  const handleDisconnect = useCallback(async () => {
    if (queryClient) {
      await queryClient.disconnect()
    }
    await disconnectSigningClient()
    setQueryClient(null)
    setChainId(null)
    setHeight(0)
    setActiveWallet(null)
    setBalance('0')
    setStatusMessage('Desconectado del nodo RPC.')
    setActiveTab('connect')
  }, [disconnectSigningClient, queryClient])

  const handleImportWallet = useCallback(
    async ({ type, mnemonic, privateKey, password, persist }: WalletImportPayload) => {
      if (!isConnected) {
        setErrorMessage('Conectate a una red antes de importar una wallet.')
        return
      }

      setErrorMessage(null)
      setStatusMessage(null)
      setIsImporting(true)

      try {
        const nextWallet =
          type === 'mnemonic'
            ? await createSignerFromMnemonic(mnemonic ?? '')
            : await createSignerFromPrivateKey(privateKey ?? '')

        await disconnectSigningClient()

        const trimmedRpc = rpcUrl.trim() || DEFAULT_CHAIN.rpcUrl
        const trimmedChainId = expectedChainId.trim() || DEFAULT_CHAIN.chainId
        const newSigningClient = await instantiateSigningClient(trimmedRpc, nextWallet.signer, trimmedChainId)

        const accountBalance = await newSigningClient.getBalance(nextWallet.address, DEFAULT_CHAIN.baseDenom)

        setSigningClient(newSigningClient)
        setActiveWallet({ address: nextWallet.address, signer: nextWallet.signer, type: nextWallet.type })
        setBalance(accountBalance?.amount ?? '0')

        let status = `Wallet importada correctamente. Dirección ${shortenAddress(nextWallet.address)}.`

        if (persist) {
          if (!password) {
            status = `${status} Se omitió el guardado porque falta la contraseña para cifrar los datos.`
            clearPersistedWallet()
            setStoredWallet(null)
          } else {
            const encrypted = await encryptSecrets(nextWallet.secrets, password, nextWallet.type, nextWallet.address)
            persistWallet(encrypted)
            setStoredWallet(encrypted)
            status = `${status} Se guardó la wallet cifrada en este navegador.`
          }
        } else {
          clearPersistedWallet()
          setStoredWallet(null)
        }

        setStatusMessage(status)
        setActiveTab('wallet')
      } catch (error) {
        console.error('Error al importar la wallet', error)
        const message = error instanceof Error ? error.message : 'Ocurrió un error inesperado al importar la wallet.'
        setErrorMessage(message)
      } finally {
        setIsImporting(false)
      }
    },
    [disconnectSigningClient, expectedChainId, isConnected, rpcUrl],
  )

  const handleUnlockWallet = useCallback(
    async (password: string) => {
      if (!storedWallet) return
      setUnlockError(null)
      setIsUnlocking(true)

      try {
        const secrets = await decryptSecrets(storedWallet, password)
        let nextWallet: Awaited<ReturnType<typeof createSignerFromMnemonic>> | Awaited<ReturnType<typeof createSignerFromPrivateKey>> | null =
          null

        if (storedWallet.type === 'mnemonic' && secrets.mnemonic) {
          nextWallet = await createSignerFromMnemonic(secrets.mnemonic)
        } else if (storedWallet.type === 'privateKey' && secrets.privateKeyHex) {
          nextWallet = await createSignerFromPrivateKey(secrets.privateKeyHex)
        }

        if (!nextWallet) {
          throw new Error('La información almacenada es insuficiente para reconstruir la wallet.')
        }

        await disconnectSigningClient()

        const trimmedRpc = rpcUrl.trim() || DEFAULT_CHAIN.rpcUrl
        const trimmedChainId = expectedChainId.trim() || DEFAULT_CHAIN.chainId
        const newSigningClient = await instantiateSigningClient(trimmedRpc, nextWallet.signer, trimmedChainId)
        const accountBalance = await newSigningClient.getBalance(nextWallet.address, DEFAULT_CHAIN.baseDenom)

        setSigningClient(newSigningClient)
        setActiveWallet({ address: nextWallet.address, signer: nextWallet.signer, type: storedWallet.type })
        setBalance(accountBalance?.amount ?? '0')
        setStatusMessage(`Wallet restaurada correctamente. Dirección ${shortenAddress(nextWallet.address)}.`)
        setErrorMessage(null)
        setUnlockError(null)
        setActiveTab('wallet')
      } catch (error) {
        console.error('Error al desbloquear la wallet', error)
        const message =
          error instanceof Error
            ? `No se pudo restaurar la wallet: ${error.message}`
            : 'No se pudo restaurar la wallet. Revisá la contraseña e intentá de nuevo.'
        setUnlockError(message)
      } finally {
        setIsUnlocking(false)
      }
    },
    [disconnectSigningClient, expectedChainId, rpcUrl, storedWallet],
  )

  const handleForgetWallet = useCallback(() => {
    clearPersistedWallet()
    setStoredWallet(null)
    setUnlockError(null)
  }, [])

  const handleCopyAddress = useCallback(() => {
    if (!activeWallet) return
    navigator.clipboard
      .writeText(activeWallet.address)
      .then(() => setStatusMessage('Dirección copiada al portapapeles.'))
      .catch(() => setStatusMessage('No se pudo copiar la dirección. Copiala manualmente.'))
  }, [activeWallet])

  const tabItems = useMemo(
    () =>
      tabs.map((tab) => ({
        ...tab,
        disabled: tab.id === 'wallet' ? !isConnected : tab.id === 'send' ? !activeWallet : false,
      })),
    [activeWallet, isConnected],
  )

  const isLight = theme === 'light'
  const pageClass = isLight ? 'min-h-screen bg-slate-50 pb-16 text-slate-900' : 'min-h-screen bg-slate-950 pb-16 text-slate-100'
  const overlayClass = isLight
    ? 'absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(148,163,209,0.25),_transparent_55%),_radial-gradient(circle_at_bottom,_rgba(134,239,172,0.2),_transparent_60%),_linear-gradient(120deg,_rgba(192,132,252,0.18),_rgba(56,189,248,0.12))]'
    : 'absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(148,163,255,0.35),_transparent_55%),_radial-gradient(circle_at_bottom,_rgba(45,212,191,0.25),_transparent_60%),_linear-gradient(120deg,_rgba(255,138,168,0.28),_rgba(37,99,235,0.15))]'
  const primarySectionClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-lg shadow-slate-200/60 backdrop-blur-sm'
    : 'rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-indigo-500/20 backdrop-blur-xl'
  const secondarySectionClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-md shadow-slate-200/50'
    : 'rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-purple-500/20'
  const mutedTextClass = isLight ? 'text-slate-600' : 'text-slate-300'
  const headingTextClass = isLight ? 'text-slate-900' : 'text-white'
  const infoCardClass = isLight
    ? 'rounded-2xl border border-slate-200 bg-white/70 p-4 text-slate-600 shadow-sm shadow-slate-200/40'
    : 'rounded-2xl border border-white/5 bg-slate-950/40 p-4 text-slate-300'
  const statusClass = isLight
    ? 'rounded-2xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm shadow-emerald-200/60'
    : 'rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 shadow-lg shadow-emerald-500/20'
  const errorClass = isLight
    ? 'rounded-2xl border border-rose-500/20 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm shadow-rose-200/60'
    : 'rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 shadow-lg shadow-rose-500/20'
  const inactiveSendClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-white/85 p-6 text-center text-sm text-slate-600 shadow-md shadow-slate-200/50'
    : 'rounded-3xl border border-white/10 bg-slate-900/60 p-6 text-center text-sm text-slate-300 shadow-lg shadow-purple-500/20'

  return (
    <div className={pageClass}>
      <div className={overlayClass} />
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={toggleTheme}
            className={
              isLight
                ? 'inline-flex items-center rounded-full border border-slate-300 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm shadow-slate-200/60 transition hover:bg-slate-100'
                : 'inline-flex items-center rounded-full border border-white/20 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-100 shadow-lg shadow-indigo-500/20 transition hover:border-white/40 hover:bg-slate-900'
            }
          >
            {isLight ? 'Modo oscuro' : 'Modo claro'}
          </button>
        </div>

        <section className={primarySectionClass}>
          <h2 className={`text-lg font-semibold ${headingTextClass}`}>Seguridad y privacidad</h2>
          <ul className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <li className={infoCardClass}>Nunca compartas tu mnemonic o clave privada. Esta app no la registra en ningún servidor.</li>
            <li className={infoCardClass}>
              Si decidís guardar la wallet en este navegador, se cifrará con la contraseña que indiques. Sin contraseña, no se
              almacena nada.
            </li>
            <li className={infoCardClass}>Hacé un backup físico (papel) de tu mnemonic y guardalo en un lugar seguro.</li>
          </ul>
        </section>

        <TabNavigation items={tabItems} current={activeTab} onSelect={setActiveTab} theme={theme} />

        {statusMessage ? (
          <div className={statusClass}>{statusMessage}</div>
        ) : null}
        {errorMessage ? (
          <div className={errorClass}>{errorMessage}</div>
        ) : null}

        {activeTab === 'connect' ? (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <ConnectView
              theme={theme}
              rpcUrl={rpcUrl}
              onRpcUrlChange={setRpcUrl}
              expectedChainId={expectedChainId}
              onExpectedChainIdChange={setExpectedChainId}
              chainId={chainId}
              height={height}
              isConnected={isConnected}
              error={connectionError}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
            <BalancePanel client={queryClient} theme={theme} />
          </div>
        ) : null}

        {activeTab === 'wallet' ? (
          <div className="space-y-6">
            {!activeWallet && storedWallet ? (
              <section className={secondarySectionClass}>
                <h2 className={`text-lg font-semibold ${headingTextClass}`}>Desbloquear wallet guardada</h2>
                <p className={`mt-1 text-sm ${mutedTextClass}`}>
                  Ingresá la contraseña para restaurar la wallet cifrada en este navegador.
                </p>
                <div className="mt-5">
                  <StoredWalletUnlock
                    theme={theme}
                    onUnlock={handleUnlockWallet}
                    onForget={handleForgetWallet}
                    loading={isUnlocking}
                    error={unlockError}
                  />
                </div>
              </section>
            ) : null}

            {!activeWallet ? (
              <section className={secondarySectionClass}>
                <h2 className={`text-lg font-semibold ${headingTextClass}`}>Importar wallet</h2>
                <p className={`mt-1 text-sm ${mutedTextClass}`}>
                  Elegí el tipo de clave, ingresá tus credenciales y decidí si querés guardarla cifrada en este navegador.
                </p>
                <div className="mt-5">
                  <WalletImportForm theme={theme} onSubmit={handleImportWallet} disabled={!isConnected} loading={isImporting} />
                </div>
              </section>
            ) : null}

            {activeWallet ? (
              <AccountSummary theme={theme} wallet={activeWallet} balance={displayBalance} onCopy={handleCopyAddress} />
            ) : null}
          </div>
        ) : null}

        {activeTab === 'send' ? (
          activeWallet ? (
            <SendTokensForm
              theme={theme}
              client={signingClient}
              senderAddress={activeWallet.address}
              balanceBaseAmount={balance}
              denom={DISPLAY_DENOM}
              decimals={DEFAULT_CHAIN.denomDecimals}
              gasPrice={gasPrice}
              baseDenom={DEFAULT_CHAIN.baseDenom}
              explorerBaseUrl={DEFAULT_CHAIN.explorerBaseUrl}
              onRefreshBalance={refreshBalance}
              onStatusMessage={setStatusMessage}
            />
          ) : (
            <div className={inactiveSendClass}>Importá o desbloqueá una wallet antes de enviar tokens.</div>
          )
        ) : null}
      </div>
    </div>
  )
}

export default App
