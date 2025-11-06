import { useCallback, useEffect, useMemo, useState } from 'react'
import { GasPrice, SigningStargateClient, StargateClient } from '@cosmjs/stargate'
import { QRCodeSVG } from 'qrcode.react'

import { SendTokensForm, StoredWalletUnlock, WalletImportForm, type WalletImportPayload } from './components/wallet'
import ConnectView from './components/ConnectView'
import {
  DEFAULT_CHAIN,
  createSignerFromMnemonic,
  createSignerFromPrivateKey,
  decryptSecrets,
  encryptSecrets,
  formatAmount,
  generateNewMnemonicWallet,
  getStoredWallets,
  instantiateSigningClient,
  persistWallet,
  removePersistedWallet,
  shortenAddress,
} from './lib/wallet'
import type { ActiveWallet, EncryptedWalletShape, GeneratedWallet } from './lib/wallet'
import { CONFIRMATION_GUIDANCE, DEFAULT_GAS_PRICE, DISPLAY_DENOM } from './config'
import './App.css'

type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'plt-wallet-theme'
const resolveInitialTheme = (): ThemeMode => {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  }
  return 'light'
}

function App() {
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
  const [isWalletPanelOpen, setIsWalletPanelOpen] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme())
  const [generatedWallet, setGeneratedWallet] = useState<GeneratedWallet | null>(null)
  const [isGeneratingWallet, setIsGeneratingWallet] = useState(false)
  const [isSavingGeneratedWallet, setIsSavingGeneratedWallet] = useState(false)
  const [createWalletName, setCreateWalletName] = useState('')
  const [createWalletPassword, setCreateWalletPassword] = useState('')
  const [createWalletLength, setCreateWalletLength] = useState<12 | 24>(24)

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
    setIsWalletPanelOpen(false)
    setShowSendModal(false)
    setShowReceiveModal(false)
    setGeneratedWallet(null)
    setCreateWalletPassword('')
    setCreateWalletName('')
    setStatusMessage('Desconectado del nodo RPC.')
  }, [disconnectSigningClient, queryClient])

  const handleGenerateWallet = useCallback(async () => {
    setErrorMessage(null)
    setStatusMessage(null)
    setIsGeneratingWallet(true)
    try {
      const trimmedName = createWalletName.trim() || undefined
      const wallet = await generateNewMnemonicWallet(trimmedName, createWalletLength)
      setGeneratedWallet(wallet)
      setCreateWalletPassword('')
      setStatusMessage('Generamos una nueva mnemonic. Guardala en un lugar seguro antes de activarla.')
    } catch (error) {
      console.error('Error al generar la wallet', error)
      const message = error instanceof Error ? error.message : 'No se pudo generar la wallet. Intentá nuevamente.'
      setErrorMessage(message)
    } finally {
      setIsGeneratingWallet(false)
    }
  }, [createWalletLength, createWalletName])

  const handleUseGeneratedWallet = useCallback(async () => {
    if (!generatedWallet) return
    if (!isConnected) {
      setErrorMessage('Conectate a una red antes de activar una wallet.')
      return
    }
    const trimmedName = createWalletName.trim() || generatedWallet.name
    const walletForSession: ActiveWallet = {
      address: generatedWallet.address,
      signer: generatedWallet.signer,
      type: generatedWallet.type,
      name: trimmedName,
    }
    try {
      await activateWallet(walletForSession)
      setGeneratedWallet((current) => (current ? { ...current, name: trimmedName } : current))
      setStatusMessage(`Wallet${trimmedName ? ` “${trimmedName}”` : ''} generada y activada.`)
      setIsWalletPanelOpen(false)
    } catch (error) {
      console.error('Error al activar la wallet generada', error)
      const message = error instanceof Error ? error.message : 'No se pudo activar la wallet generada.'
      setErrorMessage(message)
    }
  }, [activateWallet, createWalletName, generatedWallet, isConnected])

  const handlePersistGeneratedWallet = useCallback(async () => {
    if (!generatedWallet) return
    if (!createWalletPassword.trim()) {
      setErrorMessage('Definí una contraseña para guardar la wallet generada.')
      return
    }
    const trimmedName = createWalletName.trim() || generatedWallet.name
    setIsSavingGeneratedWallet(true)
    try {
      const encrypted = await encryptSecrets(
        generatedWallet.secrets,
        createWalletPassword,
        generatedWallet.type,
        generatedWallet.address,
        trimmedName,
      )
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
      setGeneratedWallet((current) => (current ? { ...current, name: trimmedName } : current))
      setStatusMessage(`Wallet${trimmedName ? ` “${trimmedName}”` : ''} guardada en este navegador.`)
      setCreateWalletPassword('')
    } catch (error) {
      console.error('Error al guardar la wallet generada', error)
      const message = error instanceof Error ? error.message : 'No se pudo guardar la wallet generada.'
      setErrorMessage(message)
    } finally {
      setIsSavingGeneratedWallet(false)
    }
  }, [createWalletName, createWalletPassword, encryptSecrets, generatedWallet, persistWallet])

  const handleCopyGeneratedMnemonic = useCallback(() => {
    if (!generatedWallet) return
    navigator.clipboard
      .writeText(generatedWallet.mnemonic)
      .then(() => setStatusMessage('Mnemonic copiada al portapapeles.'))
      .catch(() => setErrorMessage('No se pudo copiar la mnemonic. Copiala manualmente.'))
  }, [generatedWallet])

  const handleCopyGeneratedAddress = useCallback(() => {
    if (!generatedWallet) return
    navigator.clipboard
      .writeText(generatedWallet.address)
      .then(() => setStatusMessage('Dirección generada copiada al portapapeles.'))
      .catch(() => setErrorMessage('No se pudo copiar la dirección generada. Copiala manualmente.'))
  }, [generatedWallet])

  const handleDiscardGeneratedWallet = useCallback(() => {
    setGeneratedWallet(null)
    setCreateWalletPassword('')
  }, [])

  const handleImportWallet = useCallback(
    async ({ type, mnemonic, privateKey, password, persist, name }: WalletImportPayload) => {
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

        const trimmedName = name?.trim() ? name.trim() : undefined
        const walletForSession: ActiveWallet = {
          address: nextWallet.address,
          signer: nextWallet.signer,
          type: nextWallet.type,
          name: trimmedName,
        }

        await activateWallet(walletForSession)

        let status = `Wallet${trimmedName ? ` “${trimmedName}”` : ''} importada correctamente. Dirección ${shortenAddress(nextWallet.address)}.`

        if (persist) {
          if (!password) {
            status = `${status} Se omitió el guardado porque falta la contraseña para cifrar los datos.`
          } else {
            const encrypted = await encryptSecrets(nextWallet.secrets, password, nextWallet.type, nextWallet.address, trimmedName)
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
        setIsWalletPanelOpen(false)
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

        const walletForSession: ActiveWallet = {
          address: nextWallet.address,
          signer: nextWallet.signer,
          type: walletBeingUnlocked.type,
          name: walletBeingUnlocked.name,
        }
        await activateWallet(walletForSession)
        const label = walletBeingUnlocked.name ? ` “${walletBeingUnlocked.name}”` : ''
        setStatusMessage(`Wallet${label} restaurada correctamente. Dirección ${shortenAddress(nextWallet.address)}.`)
        setErrorMessage(null)
        setUnlockError(null)
        setWalletBeingUnlocked(null)
        setIsWalletPanelOpen(false)
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
      const storedEntry = storedWallets.find((item) => item.address === address)
      const label = storedEntry?.name ? `“${storedEntry.name}” (${shortenAddress(address)})` : shortenAddress(address)
      removePersistedWallet(address)
      setStoredWallets((prev) => prev.filter((item) => item.address !== address))
      if (walletBeingUnlocked?.address === address) {
        setWalletBeingUnlocked(null)
        setUnlockError(null)
      }
      setStatusMessage(`Wallet ${label} eliminada del almacenamiento local.`)
    },
    [storedWallets, walletBeingUnlocked],
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
        const label = wallet.name ? `“${wallet.name}” (${shortenAddress(wallet.address)})` : shortenAddress(wallet.address)
        setStatusMessage(`Wallet ${label} activada.`)
        setIsWalletPanelOpen(false)
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

  const handleRenameSessionWallet = useCallback(
    (address: string) => {
      const target = wallets.find((item) => item.address === address)
      if (!target) return
      if (typeof window === 'undefined') return
      const nextName = window.prompt('Nuevo nombre para la wallet', target.name ?? '') ?? undefined
      if (nextName === undefined) return
      const trimmed = nextName.trim()
      const normalized = trimmed || undefined
      if ((target.name ?? undefined) === normalized) return
      setWallets((prev) =>
        prev.map((item) => (item.address === address ? { ...item, name: normalized } : item)),
      )
      if (activeWallet?.address === address) {
        setActiveWallet((current) => (current ? { ...current, name: normalized } : current))
      }
      if (generatedWallet?.address === address) {
        setGeneratedWallet((current) => (current ? { ...current, name: normalized } : current))
      }
      setStatusMessage(normalized ? `Wallet renombrada a “${normalized}”.` : 'Nombre de la wallet eliminado.')
    },
    [activeWallet?.address, generatedWallet, wallets],
  )

  const handleRenameStoredWallet = useCallback(
    (address: string) => {
      const target = storedWallets.find((item) => item.address === address)
      if (!target) return
      if (typeof window === 'undefined') return
      const nextName = window.prompt('Nuevo nombre para la wallet guardada', target.name ?? '') ?? undefined
      if (nextName === undefined) return
      const trimmed = nextName.trim()
      const normalized = trimmed || undefined
      if ((target.name ?? undefined) === normalized) return
      const updated: EncryptedWalletShape = { ...target, name: normalized }
      setStoredWallets((prev) => prev.map((item) => (item.address === address ? updated : item)))
      if (walletBeingUnlocked?.address === address) {
        setWalletBeingUnlocked(updated)
      }
      persistWallet(updated)
      setStatusMessage(normalized ? `Wallet renombrada a “${normalized}”.` : 'Nombre de la wallet eliminado.')
    },
    [persistWallet, storedWallets, walletBeingUnlocked],
  )

  const isLight = theme === 'light'
  const pageClass = isLight
    ? 'min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 text-slate-900'
    : 'min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100'
  const appShellClass = 'mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 pb-24 pt-6 sm:px-8 lg:px-12'
  const headerClass = 'flex flex-col gap-6 pb-6 sm:flex-row sm:items-center sm:justify-between'
  const headerTitleClass = isLight ? 'text-3xl font-semibold tracking-tight text-slate-900' : 'text-3xl font-semibold tracking-tight text-white'
  const headerSubtitleClass = isLight ? 'mt-1 max-w-xl text-sm text-slate-500' : 'mt-1 max-w-xl text-sm text-slate-400'
  const headerActionsClass = 'flex flex-wrap items-center gap-3 sm:justify-end'
  const connectionBadgeClass = isConnected
    ? isLight
      ? 'inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-600 shadow-sm'
      : 'inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 shadow-[0_0_18px_rgba(45,212,191,0.25)]'
    : isLight
      ? 'inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm'
      : 'inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200 shadow-[0_0_18px_rgba(248,113,113,0.2)]'
  const walletButtonClass = isLight
    ? 'inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-slate-100 shadow-lg transition hover:border-white/40 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60'
  const themeButtonClass = isLight
    ? 'inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-100'
    : 'inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-100 shadow-lg transition hover:border-white/40 hover:bg-slate-900'
  const mainClass = 'flex-1 space-y-6'
  const primaryCardClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-xl shadow-slate-200/60 backdrop-blur-lg'
    : 'rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-indigo-500/30 backdrop-blur-lg'
  const secondaryCardClass = isLight
    ? 'rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-lg shadow-slate-200/50 backdrop-blur'
    : 'rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-indigo-500/20 backdrop-blur'
  const sectionTitleClass = isLight ? 'text-lg font-semibold text-slate-900' : 'text-lg font-semibold text-white'
  const mutedTextClass = isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-400'
  const balanceLabelClass = isLight ? 'text-xs font-semibold uppercase tracking-wide text-slate-500' : 'text-xs font-semibold uppercase tracking-wide text-slate-400'
  const balanceValueClass = isLight ? 'text-4xl font-semibold tracking-tight text-slate-900' : 'text-4xl font-semibold tracking-tight text-white'
  const walletNameClass = isLight ? 'text-base font-semibold text-slate-700' : 'text-base font-semibold text-slate-200'
  const addressBoxClass = isLight
    ? 'break-all rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700'
    : 'break-all rounded-xl border border-white/10 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-200'
  const copyButtonClass = isLight
    ? 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:shadow'
    : 'inline-flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-white/30 hover:bg-slate-900/80'
  const walletTypeBadgeClass = isLight
    ? 'inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600'
    : 'inline-flex items-center gap-2 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-200'
  const quickActionsWrapperClass = 'mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'
  const quickActionPrimaryClass = isLight
    ? 'rounded-2xl bg-gradient-to-r from-sky-400 via-indigo-400 to-emerald-400 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-300/50 transition hover:shadow-sky-400/60 disabled:cursor-not-allowed disabled:opacity-60'
    : 'rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-indigo-500/40 transition hover:shadow-indigo-500/60 disabled:cursor-not-allowed disabled:opacity-60'
  const quickActionSecondaryClass = isLight
    ? 'rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-60'
    : 'rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 shadow-lg transition hover:border-white/30 hover:bg-slate-900/80 disabled:cursor-not-allowed disabled:opacity-60'
  const quickActionGhostClass = isLight
    ? 'rounded-2xl border border-transparent bg-slate-100/80 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60'
    : 'rounded-2xl border border-transparent bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60'
  const toastContainerClass = 'pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-3'
  const successToastClass = isLight
    ? 'pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-200 bg-white/95 px-4 py-3 text-sm text-emerald-700 shadow-lg shadow-emerald-200/50'
    : 'pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-slate-900 px-4 py-3 text-sm text-emerald-200 shadow-lg shadow-emerald-500/30'
  const errorToastClass = isLight
    ? 'pointer-events-auto flex items-start gap-3 rounded-2xl border border-rose-200 bg-white/95 px-4 py-3 text-sm text-rose-700 shadow-lg shadow-rose-200/50'
    : 'pointer-events-auto flex items-start gap-3 rounded-2xl border border-rose-500/40 bg-slate-900 px-4 py-3 text-sm text-rose-200 shadow-lg shadow-rose-500/30'
  const toastCloseButtonClass = isLight
    ? 'inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/70 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-700'
    : 'inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-slate-900/80 text-xs text-slate-300 transition hover:border-white/30 hover:text-white'
  const walletLayoutInfoClass = 'space-y-6'
  const panelOverlayClass = 'fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 px-4 pb-10 pt-12 sm:items-center'
  const panelClass = isLight
    ? 'w-full max-w-3xl rounded-2xl bg-white p-6 shadow-lg shadow-slate-200/40 ring-1 ring-slate-200/60'
    : 'w-full max-w-3xl rounded-2xl bg-slate-900 p-6 shadow-xl shadow-black/40 ring-1 ring-white/10'
  const panelHeaderClass = 'flex items-start justify-between gap-4'
  const panelTitleClass = isLight ? 'text-xl font-semibold text-slate-900' : 'text-xl font-semibold text-white'
  const panelSubtitleClass = isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-300'
  const panelCloseButtonClass = isLight
    ? 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700'
    : 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-sm text-slate-200 transition hover:border-white/30 hover:text-white'
  const panelSectionTitleClass = isLight ? 'text-sm font-semibold text-slate-600' : 'text-sm font-semibold text-slate-200'
  const panelSectionHelperClass = isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-400'
  const panelFieldLabelClass = isLight ? 'text-xs font-medium text-slate-600' : 'text-xs font-medium text-slate-300'
  const panelInputClass = isLight
    ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
    : 'w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10'
  const panelTextareaClass = isLight
    ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100'
    : 'w-full rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 focus:border-white/30 focus:outline-none focus:ring-2 focus:ring-white/10'
  const panelPrimaryButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex items-center justify-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60'
  const panelSecondaryButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'
    : 'inline-flex items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:border-white/35 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
  const panelGhostButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50'
    : 'inline-flex items-center justify-center rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50'
  const panelListClass = 'space-y-3'
  const panelDividerClass = isLight ? 'my-5 border-t border-slate-200' : 'my-5 border-t border-white/10'
  const modalOverlayClass = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6'
  const modalCardClass = isLight
    ? 'w-full max-w-lg rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-2xl shadow-slate-300/70 backdrop-blur'
    : 'w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl shadow-indigo-500/40 backdrop-blur'
  const modalHeaderClass = 'flex items-center justify-between gap-4'
  const modalTitleClass = isLight ? 'text-lg font-semibold text-slate-900' : 'text-lg font-semibold text-white'
  const modalCloseButtonClass = isLight
    ? 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700'
    : 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-slate-900 text-sm text-slate-200 transition hover:border-white/30 hover:text-white'
  const receiveAddressBoxClass = addressBoxClass
  const receiveHintClass = isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-400'
  const walletItemBaseClass = isLight
    ? 'flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2'
    : 'flex items-center justify-between rounded-lg border border-white/15 bg-slate-800/80 px-3 py-2'
  const walletItemLabelClass = isLight ? 'text-sm font-medium text-slate-800' : 'text-sm font-medium text-slate-100'
  const walletItemSubClass = isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-400'
  const walletActionButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400'
    : 'inline-flex items-center justify-center rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-white/35 hover:bg-slate-900 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500'
  const walletActiveBadgeClass = isLight
    ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700'
    : 'rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-200'
  const storedWalletContainerClass = isLight
    ? 'space-y-3 rounded-lg border border-slate-200 bg-white px-3 py-3'
    : 'space-y-3 rounded-lg border border-white/15 bg-slate-800/80 px-3 py-3'
  const walletTagClass = isLight ? 'text-xs font-medium text-slate-500' : 'text-xs font-medium text-slate-400'
  const emptyStateClass = isLight ? 'rounded-3xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500' : 'rounded-3xl border border-dashed border-white/20 bg-slate-900/50 p-6 text-center text-sm text-slate-400'
  const tipsListClass = isLight ? 'list-disc space-y-2 pl-5 text-sm text-slate-500' : 'list-disc space-y-2 pl-5 text-sm text-slate-300'
  const statusDotClass = isConnected
    ? 'h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]'
    : 'h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_0_4px_rgba(248,113,113,0.18)]'
  const formattedHeight = height ? height.toLocaleString('es-AR') : '—'
  const hasSessionWallets = wallets.length > 0
  const hasStoredWallets = storedWallets.length > 0
  const walletButtonDisabled = !isConnected && !hasSessionWallets && !hasStoredWallets
  const walletButtonLabel = activeWallet
    ? activeWallet.name ?? shortenAddress(activeWallet.address)
    : hasSessionWallets || hasStoredWallets
      ? 'Cambiar o importar'
      : 'Importar wallet'
  const refreshLabel = isRefreshingBalance ? 'Actualizando…' : 'Actualizar balance'
  const canSend = Boolean(activeWallet && signingClient && !isWalletActivationPending)
  const canReceive = Boolean(activeWallet)
  const canPersistGeneratedWallet = Boolean(generatedWallet && createWalletPassword.trim().length >= 8)

  return (
    <div className={pageClass}>
      <div className={appShellClass}>
        <header className={headerClass}>
          <div>
            <h1 className={headerTitleClass}>PLT Wallet</h1>
            <p className={headerSubtitleClass}>Gestioná tus cuentas con una interfaz ligera inspirada en las wallets más populares.</p>
          </div>
          <div className={headerActionsClass}>
            <span className={connectionBadgeClass}>
              <span className={statusDotClass} />
              {isConnected ? `Conectado${chainId ? ` · ${chainId}` : ''}` : 'Sin conexión'}
            </span>
            <button
              type='button'
              onClick={() => setIsWalletPanelOpen(true)}
              className={walletButtonClass}
              disabled={walletButtonDisabled}
            >
              <span aria-hidden='true'>👛</span>
              <span>{walletButtonLabel}</span>
            </button>
            <button type='button' onClick={toggleTheme} className={themeButtonClass}>
              {isLight ? 'Modo oscuro' : 'Modo claro'}
            </button>
          </div>
        </header>

        <main className={mainClass}>
          {!isConnected ? (
            <section className={primaryCardClass}>
              <h2 className={sectionTitleClass}>Conectate a tu red</h2>
              <p className={mutedTextClass}>Ingresá los datos del nodo RPC y verificá el chain-id antes de comenzar.</p>
              <div className='mt-5'>
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
            </section>
          ) : (
            <div className={walletLayoutInfoClass}>
              <section className={primaryCardClass}>
                {activeWallet ? (
                  <div className='space-y-6'>
                    <div className='flex flex-wrap items-start justify-between gap-4'>
                      <div className='space-y-2'>
                        {activeWallet.name ? <p className={walletNameClass}>{activeWallet.name}</p> : null}
                        <div>
                          <p className={balanceLabelClass}>Balance disponible</p>
                          <p className={balanceValueClass}>
                            {displayBalance} {DISPLAY_DENOM}
                          </p>
                        </div>
                      </div>
                      <span className={walletTypeBadgeClass}>{activeWallet.type === 'mnemonic' ? 'Mnemonic' : 'Clave privada'}</span>
                    </div>
                    <div className='space-y-2'>
                      <p className={mutedTextClass}>Dirección</p>
                      <div className='flex flex-wrap items-center gap-3'>
                        <span className={addressBoxClass}>{activeWallet.address}</span>
                        <button type='button' onClick={handleCopyAddress} className={copyButtonClass}>
                          Copiar
                        </button>
                      </div>
                    </div>
                    <div className={quickActionsWrapperClass}>
                      <button
                        type='button'
                        onClick={() => setShowSendModal(true)}
                        className={quickActionPrimaryClass}
                        disabled={!canSend}
                      >
                        Enviar tokens
                      </button>
                      <button
                        type='button'
                        onClick={() => setShowReceiveModal(true)}
                        className={quickActionSecondaryClass}
                        disabled={!canReceive}
                      >
                        Recibir tokens
                      </button>
                      <button
                        type='button'
                        onClick={handleManualRefreshBalance}
                        className={quickActionGhostClass}
                        disabled={isRefreshingBalance}
                      >
                        {refreshLabel}
                      </button>
                      <button
                        type='button'
                        onClick={() => setIsWalletPanelOpen(true)}
                        className={quickActionGhostClass}
                      >
                        Gestionar wallets
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className='space-y-4'>
                    <h2 className={sectionTitleClass}>Importá tu primera wallet</h2>
                    <p className={mutedTextClass}>
                      Abrí el panel para importar una mnemonic o desbloquear una wallet previamente guardada.
                    </p>
                    <div className='flex flex-wrap gap-3'>
                      <button
                        type='button'
                        onClick={() => setIsWalletPanelOpen(true)}
                        className={quickActionPrimaryClass}
                      >
                        Gestionar wallets
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className={secondaryCardClass}>
                <div className='flex flex-wrap items-start justify-between gap-4'>
                  <div>
                    <h2 className={sectionTitleClass}>Conexión a la red</h2>
                    <p className={mutedTextClass}>Cambiate de RPC, revisá el chain-id y desconectate cuando quieras.</p>
                  </div>
                  <div className={mutedTextClass}>Altura actual: {formattedHeight}</div>
                </div>
                <div className='mt-5'>
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
              </section>

              <section className={secondaryCardClass}>
                <h2 className={sectionTitleClass}>Sugerencias de seguridad</h2>
                <ul className={tipsListClass}>
                  <li>Nunca compartas tu mnemonic o clave privada.</li>
                  <li>Las wallets guardadas se cifran con la contraseña que definas.</li>
                  <li>Mantené un backup físico de tus palabras.</li>
                </ul>
              </section>

              <section className={secondaryCardClass}>
                <h2 className={sectionTitleClass}>Actividad</h2>
                <div className={emptyStateClass}>Pronto vas a poder ver tus transacciones recientes desde aquí.</div>
              </section>
            </div>
          )}
        </main>
      </div>

      <div className={toastContainerClass} aria-live='polite' aria-atomic='true'>
        {statusMessage ? (
          <div className={successToastClass}>
            <span>{statusMessage}</span>
            <button type='button' onClick={() => setStatusMessage(null)} className={toastCloseButtonClass} aria-label='Cerrar notificación'>
              ×
            </button>
          </div>
        ) : null}
        {errorMessage ? (
          <div className={errorToastClass}>
            <span>{errorMessage}</span>
            <button type='button' onClick={() => setErrorMessage(null)} className={toastCloseButtonClass} aria-label='Cerrar notificación'>
              ×
            </button>
          </div>
        ) : null}
      </div>

      {isWalletPanelOpen ? (
        <div className={panelOverlayClass} role='dialog' aria-modal='true' aria-label='Gestión de wallets'>
          <div className={panelClass}>
            <div className={panelHeaderClass}>
              <div>
                <h2 className={panelTitleClass}>Gestionar wallets</h2>
                <p className={panelSubtitleClass}>Alterná, creá, importá y desbloqueá wallets cifradas en este dispositivo.</p>
              </div>
              <button type='button' onClick={() => setIsWalletPanelOpen(false)} className={panelCloseButtonClass} aria-label='Cerrar gestión de wallets'>
                ×
              </button>
            </div>
            <div className='mt-6 max-h-[70vh] space-y-6 overflow-y-auto pr-1'>
              <section className='space-y-3'>
                <div>
                  <p className={panelSectionTitleClass}>Wallets activas en la sesión</p>
                  <p className={panelSectionHelperClass}>Podés alternar sin reingresar la clave.</p>
                </div>
                {hasSessionWallets ? (
                  <ul className={panelListClass}>
                    {wallets.map((walletItem) => {
                      const isActiveWallet = activeWallet?.address === walletItem.address
                      const isActivating = activatingWalletAddress === walletItem.address && isWalletActivationPending
                      const knownBalance = walletBalances[walletItem.address]
                      const balanceLabel =
                        knownBalance !== undefined ? `${formatAmount(knownBalance)} ${DISPLAY_DENOM}` : 'Balance pendiente'
                      const highlightClass = isActiveWallet
                        ? isLight
                          ? 'border-emerald-400/60 bg-emerald-50/80 ring-2 ring-emerald-300/70 shadow-lg'
                          : 'border-emerald-400/40 bg-emerald-500/10 ring-2 ring-emerald-400/50 shadow-lg'
                        : isActivating
                          ? isLight
                            ? 'border-sky-300 bg-sky-100/70 ring-2 ring-sky-300/60 animate-pulse'
                            : 'border-sky-500/60 bg-sky-500/10 ring-2 ring-sky-500/60 animate-pulse'
                          : ''
                      const itemClass = [walletItemBaseClass, highlightClass].filter(Boolean).join(' ')
                      const displayName = walletItem.name ?? shortenAddress(walletItem.address)
                      const addressLabel = shortenAddress(walletItem.address)
                      return (
                        <li key={walletItem.address} className={itemClass}>
                          <div className='space-y-1'>
                            <p className={walletItemLabelClass}>{displayName}</p>
                            <p className={walletItemSubClass}>
                              <span className={walletTagClass}>{walletItem.type === 'mnemonic' ? 'Mnemonic' : 'Clave privada'}</span>
                              <span> · {addressLabel}</span>
                              <span> · {balanceLabel}</span>
                            </p>
                          </div>
                          <div className='flex items-center gap-2'>
                            <button
                              type='button'
                              onClick={() => handleRenameSessionWallet(walletItem.address)}
                              className={walletActionButtonClass}
                              disabled={isWalletActivationPending}
                            >
                              Renombrar
                            </button>
                            {isActiveWallet ? (
                              <span className={walletActiveBadgeClass}>Activa</span>
                            ) : (
                              <button
                                type='button'
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
                  <div className={emptyStateClass}>Aún no agregaste wallets esta sesión.</div>
                )}
              </section>

              {hasStoredWallets ? (
                <>
                  <div className={panelDividerClass} />
                  <section className='space-y-4'>
                    <div>
                      <p className={panelSectionTitleClass}>Wallets guardadas</p>
                      <p className={panelSectionHelperClass}>Desbloquealas con tu contraseña para activarlas.</p>
                    </div>
                    <div className='space-y-4'>
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
                        const displayName = wallet.name ?? shortenAddress(wallet.address)
                        const addressLabel = shortenAddress(wallet.address)
                        return (
                          <div key={wallet.address} className={storedWalletContainerClass}>
                            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                              <div className='space-y-1'>
                                <p className={walletItemLabelClass}>{displayName}</p>
                                <p className={walletItemSubClass}>
                                  <span className={walletTagClass}>{wallet.type === 'mnemonic' ? 'Mnemonic' : 'Clave privada'}</span>
                                  <span> · {addressLabel}</span>
                                </p>
                              </div>
                              <div className='flex items-center gap-2'>
                                <button
                                  type='button'
                                  onClick={() => handleSelectStoredWallet(wallet)}
                                  className={walletActionButtonClass}
                                  disabled={unlockDisabled}
                                  title={unlockTitle}
                                >
                                  {unlockLabel}
                                </button>
                                <button
                                  type='button'
                                  onClick={() => handleForgetStoredWallet(wallet.address)}
                                  className={walletActionButtonClass}
                                  disabled={isUnlocking || isWalletActivationPending}
                                  title='Quitar del almacenamiento local'
                                >
                                  Olvidar
                                </button>
                                <button
                                  type='button'
                                  onClick={() => handleRenameStoredWallet(wallet.address)}
                                  className={walletActionButtonClass}
                                  disabled={isUnlocking || isWalletActivationPending}
                                  title='Renombrar wallet guardada'
                                >
                                  Renombrar
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
                </>
              ) : null}

              <div className={panelDividerClass} />
              <section className='space-y-3'>
                <div>
                  <p className={panelSectionTitleClass}>Crear wallet nueva</p>
                  <p className={panelSectionHelperClass}>Generá una mnemonic y activala cuando estés listo.</p>
                </div>
                <div className='space-y-3'>
                  <div className='grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
                    <div className='space-y-1'>
                      <label htmlFor='create-wallet-name' className={panelFieldLabelClass}>
                        Nombre
                      </label>
                      <input
                        id='create-wallet-name'
                        value={createWalletName}
                        onChange={(event) => setCreateWalletName(event.target.value)}
                        className={panelInputClass}
                        placeholder='Ej. Ahorros'
                      />
                    </div>
                    <div className='space-y-1'>
                      <label htmlFor='create-wallet-length' className={panelFieldLabelClass}>
                        Cantidad de palabras
                      </label>
                      <select
                        id='create-wallet-length'
                        value={createWalletLength}
                        onChange={(event) => setCreateWalletLength(Number(event.target.value) === 12 ? 12 : 24)}
                        className={panelInputClass}
                      >
                        <option value={12}>12 palabras</option>
                        <option value={24}>24 palabras</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type='button'
                    onClick={handleGenerateWallet}
                    className={panelPrimaryButtonClass}
                    disabled={isGeneratingWallet}
                  >
                    {isGeneratingWallet ? 'Generando…' : 'Generar wallet'}
                  </button>
                  {generatedWallet ? (
                    <div className={storedWalletContainerClass}>
                      <div className='space-y-2'>
                        <label htmlFor='generated-mnemonic' className={panelFieldLabelClass}>
                          Mnemonic generada
                        </label>
                        <textarea
                          id='generated-mnemonic'
                          value={generatedWallet.mnemonic}
                          readOnly
                          className={panelTextareaClass}
                          rows={3}
                        />
                        <div className='flex flex-wrap gap-2'>
                          <button type='button' onClick={handleCopyGeneratedMnemonic} className={panelGhostButtonClass}>
                            Copiar mnemonic
                          </button>
                          <button type='button' onClick={handleCopyGeneratedAddress} className={panelGhostButtonClass}>
                            Copiar dirección
                          </button>
                        </div>
                        <p className={panelSectionHelperClass}>Guardala ahora: no volveremos a mostrarla.</p>
                      </div>
                      <div className='space-y-2'>
                        <span className={panelFieldLabelClass}>Dirección</span>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className={addressBoxClass}>{generatedWallet.address}</span>
                        </div>
                      </div>
                      <div className='space-y-2'>
                        <label htmlFor='create-wallet-password' className={panelFieldLabelClass}>
                          Contraseña para guardar (mínimo 8 caracteres)
                        </label>
                        <input
                          id='create-wallet-password'
                          type='password'
                          value={createWalletPassword}
                          onChange={(event) => setCreateWalletPassword(event.target.value)}
                          className={panelInputClass}
                          placeholder='••••••••'
                        />
                        <p className={panelSectionHelperClass}>Solo si querés almacenar la wallet cifrada en este navegador.</p>
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        <button
                          type='button'
                          onClick={handleUseGeneratedWallet}
                          className={panelPrimaryButtonClass}
                          disabled={!isConnected || isWalletActivationPending || isGeneratingWallet}
                        >
                          Activar wallet
                        </button>
                        <button
                          type='button'
                          onClick={handlePersistGeneratedWallet}
                          className={panelSecondaryButtonClass}
                          disabled={!canPersistGeneratedWallet || isSavingGeneratedWallet || isGeneratingWallet}
                        >
                          {isSavingGeneratedWallet ? 'Guardando…' : 'Guardar en navegador'}
                        </button>
                        <button type='button' onClick={handleDiscardGeneratedWallet} className={panelGhostButtonClass}>
                          Descartar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              <div className={panelDividerClass} />
              <section className='space-y-3'>
                <div>
                  <p className={panelSectionTitleClass}>Importar wallet</p>
                  <p className={panelSectionHelperClass}>Se cifra localmente si definís una contraseña.</p>
                </div>
                <div className='mt-1'>
                  <WalletImportForm
                    theme={theme}
                    onSubmit={handleImportWallet}
                    disabled={!isConnected || isWalletActivationPending}
                    loading={isImporting}
                  />
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {showSendModal && activeWallet ? (
        <div className={modalOverlayClass} role='dialog' aria-modal='true' aria-label='Enviar tokens'>
          <div className={modalCardClass}>
            <div className={modalHeaderClass}>
              <h2 className={modalTitleClass}>Enviar tokens</h2>
              <button type='button' onClick={() => setShowSendModal(false)} className={modalCloseButtonClass} aria-label='Cerrar'>
                ×
              </button>
            </div>
            <div className='mt-4'>
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
                onRefreshBalance={handleManualRefreshBalance}
                onStatusMessage={setStatusMessage}
              />
            </div>
          </div>
        </div>
      ) : null}

      {showReceiveModal && activeWallet ? (
        <div className={modalOverlayClass} role='dialog' aria-modal='true' aria-label='Recibir tokens'>
          <div className={modalCardClass}>
            <div className={modalHeaderClass}>
              <h2 className={modalTitleClass}>Recibir tokens</h2>
              <button type='button' onClick={() => setShowReceiveModal(false)} className={modalCloseButtonClass} aria-label='Cerrar'>
                ×
              </button>
            </div>
            <div className='mt-6 space-y-4 text-center'>
              <QRCodeSVG value={activeWallet.address} includeMargin size={196} />
              <div className='space-y-2'>
                <span className={receiveAddressBoxClass}>{activeWallet.address}</span>
                <div className='flex justify-center'>
                  <button type='button' onClick={handleCopyAddress} className={copyButtonClass}>
                    Copiar dirección
                  </button>
                </div>
              </div>
              <p className={receiveHintClass}>{CONFIRMATION_GUIDANCE}</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
