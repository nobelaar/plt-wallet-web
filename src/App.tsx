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
  { id: 'home', label: 'Inicio', description: 'Resumen de la app y balances' },
  { id: 'wallet', label: 'Wallet', description: 'Importar, desbloquear y ver tu cuenta' },
  { id: 'send', label: 'Enviar', description: 'Transferir tokens y revisar movimientos' },
  { id: 'settings', label: 'Ajustes', description: 'Conexión RPC y apariencia' },
]

type TabId = (typeof tabs)[number]['id']
type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'plt-wallet-theme'
const TIPS_STORAGE_KEY = 'plt-wallet-tips'

const resolveInitialTheme = (): ThemeMode => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  }
  return 'light'
}

const resolveInitialTipsVisibility = (): boolean => {
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem(TIPS_STORAGE_KEY) !== 'hidden'
  }
  return true
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
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
  const [showTips, setShowTips] = useState<boolean>(() => resolveInitialTipsVisibility())

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TIPS_STORAGE_KEY, showTips ? 'visible' : 'hidden')
    }
  }, [showTips])

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
    setActiveTab('settings')
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

  const handleHideTips = useCallback(() => {
    setShowTips(false)
  }, [])

  const handleShowTips = useCallback(() => {
    setShowTips(true)
  }, [])

  const tabItems = useMemo(
    () =>
      tabs.map((tab) => ({
        ...tab,
        disabled: tab.id === 'wallet' ? !isConnected : tab.id === 'send' ? !activeWallet : false,
      })),
    [activeWallet, isConnected],
  )

  const isLight = theme === 'light'
  const pageClass = isLight
    ? 'min-h-screen bg-gradient-to-b from-slate-100 via-slate-100 to-slate-200 text-slate-900 flex flex-col'
    : 'min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-100 flex flex-col'
  const appShellClass = 'mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-2xl lg:max-w-3xl xl:max-w-4xl'
  const mainClass = 'flex-1 px-5 pb-28 pt-6 md:px-8 lg:px-12'
  const headerTitleClass = isLight ? 'text-2xl font-semibold text-slate-900' : 'text-2xl font-semibold text-white'
  const headerSubtitleClass = isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-400'
  const sectionTitleClass = isLight ? 'text-lg font-semibold text-slate-900' : 'text-lg font-semibold text-white'
  const cardClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-lg shadow-slate-200/70 backdrop-blur'
    : 'rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-indigo-500/25 backdrop-blur'
  const secondaryCardClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-md shadow-slate-200/60'
    : 'rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-purple-500/30'
  const mutedTextClass = isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-400'
  const infoCardClass = isLight
    ? 'rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 shadow-inner shadow-slate-200/40'
    : 'rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-300'
  const statusClass = isLight
    ? 'rounded-2xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 shadow-sm shadow-emerald-200/60'
    : 'rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 shadow-lg shadow-emerald-500/20'
  const errorClass = isLight
    ? 'rounded-2xl border border-rose-500/20 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm shadow-rose-200/60'
    : 'rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 shadow-lg shadow-rose-500/20'
  const inactiveSendClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-white/90 p-6 text-center text-sm text-slate-600 shadow-md shadow-slate-200/50'
    : 'rounded-3xl border border-white/10 bg-slate-900/70 p-6 text-center text-sm text-slate-300 shadow-lg shadow-purple-500/20'
  const settingsCardHeaderClass = isLight
    ? 'flex items-center justify-between text-slate-900'
    : 'flex items-center justify-between text-white'
  const toggleButtonClass = isLight
    ? 'inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100'
    : 'inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-100 shadow-lg transition hover:border-white/40 hover:bg-slate-900'
  const homeWrapperClass = showTips ? 'space-y-5 md:grid md:grid-cols-2 md:gap-6 md:space-y-0' : 'space-y-5'
  const tipsHeaderClass = 'flex items-start justify-between gap-3'
  const tipsDismissButtonClass = isLight
    ? 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700'
    : 'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-white/40 hover:text-white'
  const tipsRestoreButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100'
    : 'inline-flex items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm font-semibold text-slate-100 shadow-lg transition hover:border-white/30 hover:bg-slate-900'
  const settingsWrapperClass = 'space-y-5 md:grid md:grid-cols-2 md:gap-6 md:space-y-0'

  return (
    <div className={pageClass}>
      <div className={appShellClass}>
        <main className={mainClass}>
          <header className="mb-6">
            <h1 className={headerTitleClass}>PLT Wallet</h1>
            <p className={headerSubtitleClass}>Gestioná tu red, tu wallet y tus envíos desde una experiencia tipo app móvil.</p>
          </header>

          {statusMessage ? <div className={`mb-4 ${statusClass}`}>{statusMessage}</div> : null}
          {errorMessage ? <div className={`mb-4 ${errorClass}`}>{errorMessage}</div> : null}

          {activeTab === 'home' ? (
            <div className="space-y-6">
              <div className={homeWrapperClass}>
                {showTips ? (
                  <section className={`${cardClass} space-y-4`}>
                    <div className={tipsHeaderClass}>
                      <h2 className={sectionTitleClass}>Recomendaciones rápidas</h2>
                      <button type="button" onClick={handleHideTips} className={tipsDismissButtonClass}>
                        Ocultar
                      </button>
                    </div>
                    <ul className="space-y-3">
                      <li className={infoCardClass}>Nunca compartas tu mnemonic o clave privada. Esta app no la registra en ningún servidor.</li>
                      <li className={infoCardClass}>
                        Si decidís guardar la wallet en este navegador, se cifrará con la contraseña que indiques. Sin contraseña, no se
                        almacena nada.
                      </li>
                      <li className={infoCardClass}>Hacé un backup físico (papel) de tu mnemonic y guardalo en un lugar seguro.</li>
                    </ul>
                  </section>
                ) : null}

                <div>
                  <BalancePanel client={queryClient} theme={theme} />
                </div>
              </div>

              {!showTips ? (
                <button type="button" onClick={handleShowTips} className={tipsRestoreButtonClass}>
                  Mostrar recomendaciones
                </button>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'wallet' ? (
            <div className="space-y-5">
              {!activeWallet && storedWallet ? (
                <section className={secondaryCardClass}>
                  <h2 className={sectionTitleClass}>Desbloquear wallet guardada</h2>
                  <p className={mutedTextClass}>Ingresá la contraseña para restaurar la wallet cifrada en este navegador.</p>
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
                <section className={secondaryCardClass}>
                  <h2 className={sectionTitleClass}>Importar wallet</h2>
                  <p className={mutedTextClass}>Elegí el tipo de clave, ingresá tus credenciales y definí si querés guardarla cifrada.</p>
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

          {activeTab === 'settings' ? (
            <div className={settingsWrapperClass}>
              <section className={`${cardClass} md:h-full`}>
                <div className={settingsCardHeaderClass}>
                  <div>
                    <h2 className={sectionTitleClass}>Apariencia</h2>
                    <p className={mutedTextClass}>Elegí el modo de visualización.</p>
                  </div>
                  <button type="button" onClick={toggleTheme} className={toggleButtonClass}>
                    {isLight ? 'Modo oscuro' : 'Modo claro'}
                  </button>
                </div>
              </section>

              <div className="md:h-full">
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
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <TabNavigation items={tabItems} current={activeTab} onSelect={setActiveTab} theme={theme} />
    </div>
  )
}

export default App
