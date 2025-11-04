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

  const gasPrice = useMemo(() => GasPrice.fromString(DEFAULT_GAS_PRICE), [])

  const isConnected = Boolean(queryClient)
  const displayBalance = useMemo(() => formatAmount(balance), [balance])

  useEffect(() => {
    const payload = getStoredWallet()
    if (payload) {
      setStoredWallet(payload)
    }
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

  return (
    <div className="min-h-screen bg-slate-950/95 pb-16 text-slate-100">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(148,163,255,0.35),_transparent_55%),_radial-gradient(circle_at_bottom,_rgba(45,212,191,0.25),_transparent_60%),_linear-gradient(120deg,_rgba(255,138,168,0.28),_rgba(37,99,235,0.15))]" />
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
        <header className="space-y-4 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">PLT Wallet Web</h1>
          <p className="mx-auto max-w-2xl text-sm text-slate-300 sm:text-base">
            Una experiencia metamask-like para Cosmos: conectate al nodo, importá o restaurá tu wallet, enviá y recibí tokens con
            una interfaz moderna llena de gradientes arcoíris.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-indigo-500/20 backdrop-blur-xl">
          <h2 className="text-lg font-semibold text-white">Seguridad y privacidad</h2>
          <ul className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
            <li className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">Nunca compartas tu mnemonic o clave privada. Esta app no la registra en ningún servidor.</li>
            <li className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">
              Si decidís guardar la wallet en este navegador, se cifrará con la contraseña que indiques. Sin contraseña, no se
              almacena nada.
            </li>
            <li className="rounded-2xl border border-white/5 bg-slate-950/40 p-4">Hacé un backup físico (papel) de tu mnemonic y guardalo en un lugar seguro.</li>
          </ul>
        </section>

        <TabNavigation items={tabItems} current={activeTab} onSelect={setActiveTab} />

        {statusMessage ? (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100 shadow-lg shadow-emerald-500/20">
            {statusMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 shadow-lg shadow-rose-500/20">
            {errorMessage}
          </div>
        ) : null}

        {activeTab === 'connect' ? (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <ConnectView
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
            <BalancePanel client={queryClient} />
          </div>
        ) : null}

        {activeTab === 'wallet' ? (
          <div className="space-y-6">
            {!activeWallet && storedWallet ? (
              <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-purple-500/20">
                <h2 className="text-lg font-semibold text-white">Desbloquear wallet guardada</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Ingresá la contraseña para restaurar la wallet cifrada en este navegador.
                </p>
                <div className="mt-5">
                  <StoredWalletUnlock
                    onUnlock={handleUnlockWallet}
                    onForget={handleForgetWallet}
                    loading={isUnlocking}
                    error={unlockError}
                  />
                </div>
              </section>
            ) : null}

            {!activeWallet ? (
              <section className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-lg shadow-purple-500/20">
                <h2 className="text-lg font-semibold text-white">Importar wallet</h2>
                <p className="mt-1 text-sm text-slate-300">
                  Elegí el tipo de clave, ingresá tus credenciales y decidí si querés guardarla cifrada en este navegador.
                </p>
                <div className="mt-5">
                  <WalletImportForm onSubmit={handleImportWallet} disabled={!isConnected} loading={isImporting} />
                </div>
              </section>
            ) : null}

            {activeWallet ? (
              <AccountSummary wallet={activeWallet} balance={displayBalance} onCopy={handleCopyAddress} />
            ) : null}
          </div>
        ) : null}

        {activeTab === 'send' ? (
          activeWallet ? (
            <SendTokensForm
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
            <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 text-center text-sm text-slate-300 shadow-lg shadow-purple-500/20">
              Importá o desbloqueá una wallet antes de enviar tokens.
            </div>
          )
        ) : null}

        <footer className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-indigo-500/20">
          <h2 className="text-lg font-semibold text-white">Checklist de QA</h2>
          <ul className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <li>Importar mnemonic válido deriva la dirección correcta y muestra balance.</li>
            <li>Importar clave privada válida deriva la dirección correcta y muestra balance.</li>
            <li>Errores claros al importar mnemonic/clave inválidos.</li>
            <li>Envío con saldo suficiente firma, transmite y muestra hash.</li>
            <li>Envío con saldo insuficiente muestra error y no envía.</li>
            <li>Restauración con contraseña correcta tras recargar (si se guardó cifrada).</li>
            <li>Botón copiar y QR funcionando para recibir.</li>
          </ul>
        </footer>
      </div>
    </div>
  )
}

export default App
