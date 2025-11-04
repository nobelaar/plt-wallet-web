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
  createSignerFromMnemonic,
  createSignerFromPrivateKey,
  decryptSecrets,
  encryptSecrets,
  formatAmount,
  getStoredWallets,
  instantiateSigningClient,
  persistWallet,
  removePersistedWallet,
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
  const [wallets, setWallets] = useState<ActiveWallet[]>([])
  const [storedWallets, setStoredWallets] = useState<EncryptedWalletShape[]>([])
  const [walletBeingUnlocked, setWalletBeingUnlocked] = useState<EncryptedWalletShape | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isWalletActivationPending, setIsWalletActivationPending] = useState(false)
  const [balance, setBalance] = useState('0')
  const [walletBalances, setWalletBalances] = useState<Record<string, string>>({})
  const [isRefreshingBalance, setIsRefreshingBalance] = useState(false)
  const [activatingWalletAddress, setActivatingWalletAddress] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [showTips, setShowTips] = useState<boolean>(() => resolveInitialTipsVisibility())

  const gasPrice = useMemo(() => GasPrice.fromString(DEFAULT_GAS_PRICE), [])

  const isConnected = Boolean(queryClient)
  const displayBalance = useMemo(() => formatAmount(balance), [balance])

  useEffect(() => {
    const stored = getStoredWallets()
    if (stored.length) {
      setStoredWallets(stored)
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
    setIsRefreshingBalance(true)
    try {
      const accountBalance = await signingClient.getBalance(activeWallet.address, DEFAULT_CHAIN.baseDenom)
      const amount = accountBalance?.amount ?? '0'
      setBalance(amount)
      setWalletBalances((prev) => ({ ...prev, [activeWallet.address]: amount }))
      setErrorMessage(null)
    } catch (error) {
      console.error('No se pudo consultar el balance', error)
      setErrorMessage('No se pudo actualizar el balance. Revisá la conexión e intentá nuevamente.')
    } finally {
      setIsRefreshingBalance(false)
    }
  }, [activeWallet, signingClient])

  const activateWallet = useCallback(
    async (wallet: ActiveWallet) => {
      setIsWalletActivationPending(true)
      setActivatingWalletAddress(wallet.address)
      try {
        await disconnectSigningClient()
        const trimmedRpc = rpcUrl.trim() || DEFAULT_CHAIN.rpcUrl
        const trimmedChainId = expectedChainId.trim() || DEFAULT_CHAIN.chainId
        const newSigningClient = await instantiateSigningClient(trimmedRpc, wallet.signer, trimmedChainId)
        try {
          const accountBalance = await newSigningClient.getBalance(wallet.address, DEFAULT_CHAIN.baseDenom)
          const amount = accountBalance?.amount ?? '0'

          setSigningClient(newSigningClient)
          setActiveWallet(wallet)
          setBalance(amount)
          setWalletBalances((prev) => ({ ...prev, [wallet.address]: amount }))
          setWallets((prev) => {
            const existingIndex = prev.findIndex((item) => item.address === wallet.address)
            if (existingIndex >= 0) {
              const next = [...prev]
              next.splice(existingIndex, 1)
              return [wallet, ...next]
            }
            return [wallet, ...prev]
          })
          setErrorMessage(null)
          return amount
        } catch (error) {
          await newSigningClient.disconnect()
          throw error
        }
      } finally {
        setActivatingWalletAddress(null)
        setIsWalletActivationPending(false)
      }
    },
    [disconnectSigningClient, expectedChainId, rpcUrl],
  )

  const handleManualRefreshBalance = useCallback(async () => {
    await refreshBalance()
    if (signingClient && activeWallet) {
      setStatusMessage('Balance actualizado.')
    }
  }, [activeWallet, refreshBalance, signingClient])

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
    setWallets([])
    setBalance('0')
    setWalletBalances({})
    setWalletBeingUnlocked(null)
    setUnlockError(null)
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

        await activateWallet({ address: nextWallet.address, signer: nextWallet.signer, type: nextWallet.type })

        let status = `Wallet importada correctamente. Dirección ${shortenAddress(nextWallet.address)}.`

        if (persist) {
          if (!password) {
            status = `${status} Se omitió el guardado porque falta la contraseña para cifrar los datos.`
          } else {
            const encrypted = await encryptSecrets(nextWallet.secrets, password, nextWallet.type, nextWallet.address)
            persistWallet(encrypted)
            setStoredWallets((prev) => {
              const index = prev.findIndex((item) => item.address === encrypted.address)
              if (index >= 0) {
                const next = [...prev]
                next[index] = encrypted
                return next
              }
              return [...prev, encrypted]
            })
            status = `${status} Se guardó la wallet cifrada en este navegador.`
          }
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
    [activateWallet, encryptSecrets, isConnected, persistWallet],
  )

  const handleUnlockWallet = useCallback(
    async (password: string) => {
      if (!walletBeingUnlocked) return
      if (!isConnected) {
        setUnlockError('Conectate a una red antes de desbloquear una wallet guardada.')
        return
      }
      setUnlockError(null)
      setIsUnlocking(true)

      try {
        const secrets = await decryptSecrets(walletBeingUnlocked, password)
        let nextWallet: Awaited<ReturnType<typeof createSignerFromMnemonic>> | Awaited<ReturnType<typeof createSignerFromPrivateKey>> | null =
          null

        if (walletBeingUnlocked.type === 'mnemonic' && secrets.mnemonic) {
          nextWallet = await createSignerFromMnemonic(secrets.mnemonic)
        } else if (walletBeingUnlocked.type === 'privateKey' && secrets.privateKeyHex) {
          nextWallet = await createSignerFromPrivateKey(secrets.privateKeyHex)
        }

        if (!nextWallet) {
          throw new Error('La información almacenada es insuficiente para reconstruir la wallet.')
        }

        await activateWallet({ address: nextWallet.address, signer: nextWallet.signer, type: walletBeingUnlocked.type })
        setStatusMessage(`Wallet restaurada correctamente. Dirección ${shortenAddress(nextWallet.address)}.`)
        setErrorMessage(null)
        setUnlockError(null)
        setWalletBeingUnlocked(null)
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
    [activateWallet, decryptSecrets, isConnected, walletBeingUnlocked],
  )

  const handleForgetStoredWallet = useCallback(
    (address: string) => {
      removePersistedWallet(address)
      setStoredWallets((prev) => prev.filter((item) => item.address !== address))
      if (walletBeingUnlocked?.address === address) {
        setWalletBeingUnlocked(null)
        setUnlockError(null)
      }
      setStatusMessage(`Wallet ${shortenAddress(address)} eliminada del almacenamiento local.`)
    },
    [walletBeingUnlocked],
  )

  const handleSelectStoredWallet = useCallback((wallet: EncryptedWalletShape) => {
    setUnlockError(null)
    setWalletBeingUnlocked((current) => (current?.address === wallet.address ? null : wallet))
  }, [])

  const handleSelectWallet = useCallback(
    async (address: string) => {
      if (!isConnected) {
        setErrorMessage('Conectate a una red antes de alternar entre wallets.')
        return
      }
      if (activeWallet?.address === address) return
      const wallet = wallets.find((item) => item.address === address)
      if (!wallet) return

      setErrorMessage(null)
      setStatusMessage(null)

      try {
        await activateWallet(wallet)
        setStatusMessage(`Wallet ${shortenAddress(wallet.address)} activada.`)
      } catch (error) {
        console.error('No se pudo activar la wallet seleccionada', error)
        const message = error instanceof Error ? error.message : 'No se pudo activar la wallet seleccionada.'
        setErrorMessage(message)
      }
    },
    [activateWallet, activeWallet?.address, isConnected, wallets],
  )

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
        description:
          tab.id === 'wallet'
            ? activeWallet
              ? `Activa: ${shortenAddress(activeWallet.address)}`
              : 'Sin wallet activa'
            : tab.id === 'send'
              ? activeWallet
                ? 'Listo para enviar'
                : 'Requiere wallet'
            : tab.id === 'settings'
                ? chainId
                  ? `Chain: ${chainId}`
                  : isConnected
                    ? 'RPC conectado'
                    : 'Sin conexión'
                : tab.description,
        disabled: tab.id === 'wallet' ? !isConnected : tab.id === 'send' ? !activeWallet : false,
      })),
    [activeWallet, chainId, isConnected],
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
  const walletLayoutClass = 'space-y-5 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-6 md:space-y-0'
  const walletListClass = 'mt-4 space-y-3'
  const walletItemBaseClass = isLight
    ? 'flex items-center justify-between rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm transition'
    : 'flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 shadow-lg transition'
  const walletItemLabelClass = isLight ? 'text-sm font-semibold text-slate-800' : 'text-sm font-semibold text-slate-100'
  const walletItemSubClass = isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-400'
  const walletActionButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400'
    : 'inline-flex items-center justify-center rounded-xl border border-white/20 bg-transparent px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500'
  const walletActiveBadgeClass = isLight
    ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700'
    : 'rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-200'
  const storedWalletContainerClass = isLight
    ? 'space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm shadow-slate-200/60'
    : 'space-y-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-indigo-500/20'
  const walletTagClass = isLight ? 'text-[11px] uppercase tracking-wide text-slate-500' : 'text-[11px] uppercase tracking-wide text-slate-400'
  const infoPillClass = isLight
    ? 'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100/70 px-3 py-1 text-xs font-medium text-slate-600'
    : 'inline-flex items-center gap-2 rounded-full border border-white/5 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-300'

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
            <div className={walletLayoutClass}>
              <div className="space-y-5">
                {activeWallet ? (
                  <section className="space-y-4">
                    <AccountSummary
                      theme={theme}
                      wallet={activeWallet}
                      balance={displayBalance}
                      onCopy={handleCopyAddress}
                      onRefreshBalance={handleManualRefreshBalance}
                      refreshingBalance={isRefreshingBalance}
                    />
                    <div className="flex flex-wrap gap-2" aria-live="polite">
                      <span className={infoPillClass} title="Se usa para enviar y firmar transacciones.">
                        La wallet activa firma y envía tus operaciones.
                      </span>
                      <span className={infoPillClass} title="Podés alternar sin volver a importar.">
                        Cambiá de wallet desde la sección de gestión.
                      </span>
                    </div>
                  </section>
                ) : (
                  <section className={secondaryCardClass}>
                    <h2 className={sectionTitleClass}>Sin wallet activa</h2>
                    <p className={mutedTextClass}>
                      Importá una wallet o desbloqueá una guardada para ver el resumen de la cuenta y poder firmar operaciones.
                    </p>
                  </section>
                )}

                <section className={secondaryCardClass}>
                  <h2 className={sectionTitleClass}>Importar wallet</h2>
                  <p className={mutedTextClass}>
                    Elegí el tipo de clave, ingresá tus credenciales y definí si querés guardarla cifrada en este navegador.
                  </p>
                  <div className="mt-5">
                    <WalletImportForm
                      theme={theme}
                      onSubmit={handleImportWallet}
                      disabled={!isConnected || isWalletActivationPending}
                      loading={isImporting}
                    />
                  </div>
                </section>
              </div>

              <div className="space-y-5">
                <section className={secondaryCardClass}>
                  <h2 className={sectionTitleClass}>Tus wallets</h2>
                  <p className={mutedTextClass}>
                    Administrá todas las wallets activas en esta sesión. La seleccionada se usa automáticamente para enviar tokens.
                  </p>
                  {wallets.length ? (
                    <ul className={walletListClass}>
                      {wallets.map((walletItem) => {
                        const isActiveWallet = activeWallet?.address === walletItem.address
                        const isActivating = activatingWalletAddress === walletItem.address && isWalletActivationPending
                        const knownBalance = walletBalances[walletItem.address]
                        const balanceLabel =
                          knownBalance !== undefined ? `${formatAmount(knownBalance)} ${DISPLAY_DENOM}` : 'Balance pendiente'
                        const walletItemClass = [
                          walletItemBaseClass,
                          isActiveWallet
                            ? isLight
                              ? 'border-emerald-400/60 bg-emerald-50/80 ring-2 ring-emerald-300/70 shadow-lg'
                              : 'border-emerald-400/40 bg-emerald-500/10 ring-2 ring-emerald-400/50 shadow-lg'
                            : isActivating
                              ? isLight
                                ? 'border-sky-300 bg-sky-100/70 ring-2 ring-sky-300/60 animate-pulse'
                                : 'border-sky-500/60 bg-sky-500/10 ring-2 ring-sky-500/60 animate-pulse'
                              : ''
                        ]
                          .filter(Boolean)
                          .join(' ')
                        return (
                          <li key={walletItem.address} className={walletItemClass}>
                            <div className="space-y-1">
                              <p className={walletItemLabelClass}>{shortenAddress(walletItem.address)}</p>
                              <p className={walletItemSubClass}>
                                <span className={walletTagClass}>{walletItem.type === 'mnemonic' ? 'Mnemonic' : 'Clave privada'}</span>
                                <span> · {balanceLabel}</span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {isActiveWallet ? (
                                <span className={walletActiveBadgeClass}>Activa</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSelectWallet(walletItem.address)}
                                  className={walletActionButtonClass}
                                  disabled={isWalletActivationPending || !isConnected}
                                  title={isConnected ? 'Cambiar wallet activa' : 'Necesitás estar conectado para alternar'}
                                >
                                  {isActivating ? 'Activando…' : 'Usar'}
                                </button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className={`${mutedTextClass} mt-4`}>Cuando importes o desbloquees wallets, aparecerán acá.</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className={infoPillClass}>Podés refrescar el balance desde el resumen de la wallet activa.</span>
                    <span className={infoPillClass}>Las wallets agregadas se mantienen mientras dure esta sesión.</span>
                  </div>
                </section>

                {storedWallets.length ? (
                  <section className={secondaryCardClass}>
                    <h2 className={sectionTitleClass}>Wallets guardadas en este navegador</h2>
                    <p className={mutedTextClass}>Desbloquealas con tu contraseña para activarlas cuando las necesites.</p>
                    <div className="mt-4 space-y-4">
                      {storedWallets.map((wallet) => {
                        const isCurrent = walletBeingUnlocked?.address === wallet.address
                        const unlockLabel = isCurrent ? (isUnlocking ? 'Desbloqueando…' : 'Cancelar') : 'Desbloquear'
                        const unlockTitle = isCurrent
                          ? isUnlocking
                            ? 'Esperá a que termine el desbloqueo.'
                            : 'Cancelar el desbloqueo'
                          : 'Ingresá la contraseña para usarla'
                        const unlockDisabled =
                          isWalletActivationPending ||
                          (isUnlocking && walletBeingUnlocked?.address !== wallet.address) ||
                          (isCurrent && isUnlocking)
                        return (
                          <div key={wallet.address} className={storedWalletContainerClass}>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="space-y-1">
                                <p className={walletItemLabelClass}>{shortenAddress(wallet.address)}</p>
                                <p className={walletItemSubClass}>{wallet.type === 'mnemonic' ? 'Mnemonic' : 'Clave privada'}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSelectStoredWallet(wallet)}
                                  className={walletActionButtonClass}
                                  disabled={unlockDisabled}
                                  title={unlockTitle}
                                >
                                  {unlockLabel}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleForgetStoredWallet(wallet.address)}
                                  className={walletActionButtonClass}
                                  disabled={isUnlocking || isWalletActivationPending}
                                  title="Quitar del almacenamiento local"
                                >
                                  Olvidar
                                </button>
                              </div>
                            </div>
                            {isCurrent ? (
                              <StoredWalletUnlock
                                theme={theme}
                                onUnlock={handleUnlockWallet}
                                onForget={() => handleForgetStoredWallet(wallet.address)}
                                loading={isUnlocking}
                                error={walletBeingUnlocked?.address === wallet.address ? unlockError : null}
                              />
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ) : null}
              </div>
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
