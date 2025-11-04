import { useEffect, useMemo, useState } from 'react'
import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet } from '@cosmjs/proto-signing'
import { SigningStargateClient, GasPrice, calculateFee, coins } from '@cosmjs/stargate'
import { fromHex } from '@cosmjs/encoding'
import { validateMnemonic } from 'bip39'
import { QRCodeSVG } from 'qrcode.react'
import {
  ADDRESS_PREFIX,
  BASE_DENOM,
  CHAIN_ID,
  CONFIRMATION_GUIDANCE,
  DEFAULT_GAS_PRICE,
  DISPLAY_DECIMALS,
  DISPLAY_DENOM,
  EXPLORER_BASE_URL,
  RPC_ENDPOINT,
  STORAGE_KEY,
} from './config'
import './App.css'

type WalletSource = 'mnemonic' | 'privateKey'

interface ActiveWallet {
  address: string
  signer: DirectSecp256k1HdWallet | DirectSecp256k1Wallet
  type: WalletSource
}

interface EncryptedWalletShape {
  address: string
  type: WalletSource
  ciphertext: string
  iv: string
  salt: string
}

interface StoredSecrets {
  mnemonic?: string
  privateKeyHex?: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const gasPrice = GasPrice.fromString(DEFAULT_GAS_PRICE)
const DEFAULT_GAS_LIMIT = 200000
const ADDRESS_REGEX = new RegExp(`^${ADDRESS_PREFIX}1[0-9a-z]{38,58}$`)

function formatAmount(amount: string | undefined): string {
  if (!amount) return '0'
  const value = Number(amount) / 10 ** DISPLAY_DECIMALS
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: DISPLAY_DECIMALS,
  })
}

async function deriveKey(password: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer,
      iterations: 250000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function bufferToBase64(buffer: Uint8Array) {
  let binary = ''
  buffer.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function base64ToBuffer(value: string) {
  const binary = atob(value)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    buffer[i] = binary.charCodeAt(i)
  }
  return buffer
}

async function encryptSecrets(
  secrets: StoredSecrets,
  password: string,
  type: WalletSource,
  address: string,
): Promise<EncryptedWalletShape> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(secrets)))

  return {
    address,
    type,
    ciphertext: bufferToBase64(new Uint8Array(ciphertext)),
    iv: bufferToBase64(iv),
    salt: bufferToBase64(salt),
  }
}

async function decryptSecrets(payload: EncryptedWalletShape, password: string): Promise<StoredSecrets> {
  const salt = base64ToBuffer(payload.salt)
  const iv = base64ToBuffer(payload.iv)
  const ciphertext = base64ToBuffer(payload.ciphertext)
  const key = await deriveKey(password, salt)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  const json = decoder.decode(decrypted)
  return JSON.parse(json) as StoredSecrets
}

function getStoredWallet(): EncryptedWalletShape | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as EncryptedWalletShape
  } catch (error) {
    console.error('No se pudo parsear la wallet almacenada de manera segura.', error)
    return null
  }
}

function persistWallet(payload: EncryptedWalletShape) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...payload,
    }),
  )
}

function clearPersistedWallet() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

function validatePrivateKeyHex(value: string) {
  return /^[0-9a-fA-F]{64}$/.test(value.trim())
}

function shortenAddress(address: string) {
  return `${address.slice(0, 10)}…${address.slice(-7)}`
}

function generateTotal(amount: number, fee: number) {
  return (amount + fee).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: DISPLAY_DECIMALS,
  })
}

function App() {
  const [walletType, setWalletType] = useState<WalletSource>('mnemonic')
  const [mnemonicInput, setMnemonicInput] = useState('')
  const [privateKeyInput, setPrivateKeyInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [shouldPersist, setShouldPersist] = useState(false)
  const [activeWallet, setActiveWallet] = useState<ActiveWallet | null>(null)
  const [client, setClient] = useState<SigningStargateClient | null>(null)
  const [balance, setBalance] = useState<string>('0')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [destination, setDestination] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [memo, setMemo] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ hash: string } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [feeAmount, setFeeAmount] = useState<number>(0)
  const [storedWallet, setStoredWallet] = useState<EncryptedWalletShape | null>(null)

  useEffect(() => {
    const payload = getStoredWallet()
    if (payload) {
      setStoredWallet(payload)
    }
  }, [])

  useEffect(() => {
    async function refreshBalance() {
      if (!client || !activeWallet) return
      try {
        const response = await client.getBalance(activeWallet.address, BASE_DENOM)
        setBalance(response?.amount ?? '0')
      } catch (error) {
        console.error('No se pudo consultar el balance', error)
      }
    }

    refreshBalance()
  }, [client, activeWallet])

  const displayBalance = useMemo(() => formatAmount(balance), [balance])

  const feeDisplay = useMemo(
    () => feeAmount.toLocaleString('es-AR', { maximumFractionDigits: DISPLAY_DECIMALS }),
    [feeAmount],
  )

  async function instantiateClient(signer: ActiveWallet['signer']) {
    const signingClient = await SigningStargateClient.connectWithSigner(RPC_ENDPOINT, signer, { gasPrice })
    const remoteChainId = await signingClient.getChainId()
    if (remoteChainId !== CHAIN_ID) {
      await signingClient.disconnect()
      throw new Error(`Se esperaba chain-id ${CHAIN_ID} pero la red respondió ${remoteChainId}.`)
    }
    setClient(signingClient)
    return signingClient
  }

  async function handleImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setStatusMessage(null)
    setIsImporting(true)

    try {
      let signer: ActiveWallet['signer']
      let address: string
      let secrets: StoredSecrets

      if (walletType === 'mnemonic') {
        const normalized = mnemonicInput.trim().toLowerCase().replace(/\s+/g, ' ')
        if (!validateMnemonic(normalized)) {
          throw new Error('Mnemonic inválido — revisá las palabras y los espacios.')
        }
        signer = await DirectSecp256k1HdWallet.fromMnemonic(normalized, {
          prefix: ADDRESS_PREFIX,
        })
        const accounts = await signer.getAccounts()
        address = accounts[0]?.address ?? ''
        secrets = { mnemonic: normalized }
      } else {
        const cleaned = privateKeyInput.trim()
        if (!validatePrivateKeyHex(cleaned)) {
          throw new Error('Clave privada inválida — revisá el formato.')
        }
        const keyBytes = fromHex(cleaned)
        signer = await DirectSecp256k1Wallet.fromKey(keyBytes, ADDRESS_PREFIX)
        const accounts = await signer.getAccounts()
        address = accounts[0]?.address ?? ''
        secrets = { privateKeyHex: cleaned }
      }

      if (!address) {
        throw new Error('No se pudo derivar la dirección de la wallet.')
      }

      if (client) {
        await client.disconnect()
        setClient(null)
      }
      const signingClient = await instantiateClient(signer)
      const accountBalance = await signingClient.getBalance(address, BASE_DENOM)
      setBalance(accountBalance?.amount ?? '0')
      setActiveWallet({ address, signer, type: walletType })
      setStatusMessage(`Wallet importada correctamente. Dirección ${shortenAddress(address)}.`)

      if (shouldPersist) {
        if (!passwordInput) {
          setStatusMessage((prev) =>
            `${prev ?? ''} Se omitió el guardado porque falta la contraseña para cifrar los datos.`.trim(),
          )
        } else {
          const encrypted = await encryptSecrets(secrets, passwordInput, walletType, address)
          persistWallet(encrypted)
          setStatusMessage((prev) => `${prev ?? ''} Se guardó la wallet cifrada en este navegador.`.trim())
          setStoredWallet(encrypted)
        }
      } else {
        clearPersistedWallet()
        setStoredWallet(null)
      }

      setMnemonicInput('')
      setPrivateKeyInput('')
      setPasswordInput('')
      setShouldPersist(false)
    } catch (error) {
      console.error('Error al importar la wallet', error)
      if (error instanceof Error) {
        setErrorMessage(error.message)
      } else {
        setErrorMessage('Ocurrió un error inesperado al importar la wallet.')
      }
    } finally {
      setIsImporting(false)
    }
  }

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!storedWallet) return
    setUnlockError(null)
    setIsUnlocking(true)
    try {
      const secrets = await decryptSecrets(storedWallet, unlockPassword)
      let signer: ActiveWallet['signer']
      let address = storedWallet.address

      if (storedWallet.type === 'mnemonic' && secrets.mnemonic) {
        signer = await DirectSecp256k1HdWallet.fromMnemonic(secrets.mnemonic, { prefix: ADDRESS_PREFIX })
        const [account] = await signer.getAccounts()
        address = account?.address ?? storedWallet.address
      } else if (storedWallet.type === 'privateKey' && secrets.privateKeyHex) {
        signer = await DirectSecp256k1Wallet.fromKey(fromHex(secrets.privateKeyHex), ADDRESS_PREFIX)
        const [account] = await signer.getAccounts()
        address = account?.address ?? storedWallet.address
      } else {
        throw new Error('La información almacenada es insuficiente para reconstruir la wallet.')
      }

      if (client) {
        await client.disconnect()
        setClient(null)
      }
      const signingClient = await instantiateClient(signer)
      const accountBalance = await signingClient.getBalance(address, BASE_DENOM)
      setBalance(accountBalance?.amount ?? '0')
      setActiveWallet({ address, signer, type: storedWallet.type })
      setStatusMessage(`Wallet restaurada correctamente. Dirección ${shortenAddress(address)}.`)
      setErrorMessage(null)
      setUnlockError(null)
      setUnlockPassword('')
    } catch (error) {
      console.error('Error al desbloquear la wallet', error)
      if (error instanceof Error) {
        setUnlockError(`No se pudo restaurar la wallet: ${error.message}`)
      } else {
        setUnlockError('No se pudo restaurar la wallet. Revisá la contraseña e intentá de nuevo.')
      }
    } finally {
      setIsUnlocking(false)
    }
  }

  function resetSendState() {
    setDestination('')
    setAmountInput('')
    setMemo('')
    setShowConfirm(false)
    setFeeAmount(0)
    setSendError(null)
    setSendResult(null)
  }

  async function handlePrepareSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSendError(null)
    setSendResult(null)
    if (!client || !activeWallet) {
      setSendError('Importá una wallet antes de enviar tokens.')
      return
    }

    const trimmedDestination = destination.trim()
    if (!ADDRESS_REGEX.test(trimmedDestination)) {
      setSendError('La dirección destino no tiene un formato válido.')
      return
    }

    const amountNumber = Number(amountInput)
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setSendError('Ingresá un monto numérico mayor a cero.')
      return
    }

    const amountBase = Math.round(amountNumber * 10 ** DISPLAY_DECIMALS)
    const available = Number(balance)

    const fee = calculateFee(DEFAULT_GAS_LIMIT, gasPrice)
    const feeBase = Number(fee.amount[0]?.amount ?? '0')
    setFeeAmount(feeBase / 10 ** DISPLAY_DECIMALS)

    const totalRequired = amountBase + feeBase
    if (totalRequired > available) {
      setSendError('No hay saldo suficiente para cubrir el monto y las comisiones.')
      return
    }

    setShowConfirm(true)
  }

  async function handleSend() {
    if (!client || !activeWallet) return
    setIsSending(true)
    setSendError(null)

    try {
      const amountNumber = Number(amountInput)
      const amountBase = Math.round(amountNumber * 10 ** DISPLAY_DECIMALS)
      const fee = calculateFee(DEFAULT_GAS_LIMIT, gasPrice)

      const result = await client.sendTokens(
        activeWallet.address,
        destination.trim(),
        coins(amountBase, BASE_DENOM),
        fee,
        memo.trim() || undefined,
      )

      if (result.code !== 0) {
        setSendError(`No se pudo enviar la transacción. Código de error: ${result.code}. Mensaje: ${result.rawLog}`)
        return
      }

      setSendResult({ hash: result.transactionHash })
      setStatusMessage('Transacción enviada con éxito.')
      const updatedBalance = await client.getBalance(activeWallet.address, BASE_DENOM)
      setBalance(updatedBalance?.amount ?? balance)
      setShowConfirm(false)
      setFeeAmount(0)
    } catch (error) {
      console.error('No se pudo enviar la transacción', error)
      if (typeof error === 'object' && error && 'code' in error) {
        const code = (error as { code: number }).code
        const message = (error as { message?: string }).message ?? 'Error desconocido'
        setSendError(`No se pudo enviar la transacción. Código de error: ${code}. Mensaje: ${message}`)
      } else if (error instanceof Error) {
        setSendError(`No se pudo enviar la transacción. Mensaje: ${error.message}`)
      } else {
        setSendError('No se pudo enviar la transacción. Revisá los datos e intentá nuevamente.')
      }
    } finally {
      setIsSending(false)
    }
  }

  function handleCopyAddress() {
    if (!activeWallet) return
    navigator.clipboard
      .writeText(activeWallet.address)
      .then(() => setStatusMessage('Dirección copiada al portapapeles.'))
      .catch(() => setStatusMessage('No se pudo copiar la dirección. Copiala manualmente.'))
  }

  return (
    <div className="app">
      <header>
        <h1>PLT Wallet Web</h1>
        <p className="subtitle">Importá tu wallet, enviá y recibí tokens de Cosmos.</p>
      </header>

      <section className="security">
        <h2>Seguridad y privacidad</h2>
        <ul>
          <li>Nunca compartas tu mnemonic o clave privada. Esta app no la registra en ningún servidor.</li>
          <li>
            Si decidís guardar la wallet en este navegador, se cifrará con la contraseña que indiques. Sin contraseña, no se
            almacena nada.
          </li>
          <li>Hacé un backup físico (papel) de tu mnemonic y guardalo en un lugar seguro.</li>
        </ul>
      </section>

      {statusMessage ? <div className="status">{statusMessage}</div> : null}
      {errorMessage ? <div className="error">{errorMessage}</div> : null}

      {!activeWallet && storedWallet ? (
        <section className="card">
          <h2>Desbloquear wallet guardada</h2>
          <p>Ingresá la contraseña para restaurar la wallet cifrada en este navegador.</p>
          <form onSubmit={handleUnlock} className="form-grid">
            <label htmlFor="unlock-password">Contraseña</label>
            <input
              id="unlock-password"
              type="password"
              value={unlockPassword}
              onChange={(event) => setUnlockPassword(event.target.value)}
              required
            />
            {unlockError ? <div className="error inline">{unlockError}</div> : null}
            <button type="submit" disabled={isUnlocking} className="primary">
              {isUnlocking ? 'Desbloqueando…' : 'Desbloquear'}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                clearPersistedWallet()
                setStoredWallet(null)
              }}
            >
              Olvidar esta wallet
            </button>
          </form>
        </section>
      ) : null}

      {!activeWallet ? (
        <section className="card">
          <h2>Importar wallet</h2>
          <form onSubmit={handleImport} className="form-grid">
            <label htmlFor="type-select">Tipo de clave</label>
            <select
              id="type-select"
              value={walletType}
              onChange={(event) => {
                setWalletType(event.target.value as WalletSource)
                setErrorMessage(null)
              }}
            >
              <option value="mnemonic">Mnemonic BIP39</option>
              <option value="privateKey">Clave privada (hex)</option>
            </select>

            {walletType === 'mnemonic' ? (
              <>
                <label htmlFor="mnemonic-input">Mnemonic</label>
                <textarea
                  id="mnemonic-input"
                  value={mnemonicInput}
                  onChange={(event) => setMnemonicInput(event.target.value)}
                  placeholder="ingresá las 12 o 24 palabras…"
                  required
                  rows={3}
                />
              </>
            ) : (
              <>
                <label htmlFor="private-key-input">Clave privada (64 caracteres hexadecimales)</label>
                <input
                  id="private-key-input"
                  value={privateKeyInput}
                  onChange={(event) => setPrivateKeyInput(event.target.value)}
                  placeholder="abcd1234…"
                  required
                />
              </>
            )}

            <div className="persist">
              <label htmlFor="persist-toggle">
                <input
                  id="persist-toggle"
                  type="checkbox"
                  checked={shouldPersist}
                  onChange={(event) => setShouldPersist(event.target.checked)}
                />
                Guardar cifrado en este navegador (opcional)
              </label>
            </div>

            {shouldPersist ? (
              <>
                <label htmlFor="password-input">Contraseña para cifrar</label>
                <input
                  id="password-input"
                  type="password"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  placeholder="mínimo 8 caracteres"
                  minLength={8}
                  required
                />
              </>
            ) : null}

            <button type="submit" className="primary" disabled={isImporting}>
              {isImporting ? 'Importando…' : 'Importar wallet'}
            </button>
          </form>
        </section>
      ) : null}

      {activeWallet ? (
        <section className="card">
          <h2>Resumen de cuenta</h2>
          <div className="account-row">
            <span>Dirección</span>
            <strong>{activeWallet.address}</strong>
          </div>
          <div className="account-row">
            <span>Balance disponible</span>
            <strong>
              {displayBalance} {DISPLAY_DENOM}
            </strong>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={handleCopyAddress}>
              Copiar dirección
            </button>
            <button type="button" className="secondary" onClick={resetSendState}>
              Reiniciar envío
            </button>
          </div>
        </section>
      ) : null}

      {activeWallet ? (
        <section className="card">
          <h2>Enviar tokens</h2>
          <form onSubmit={handlePrepareSend} className="form-grid">
            <label htmlFor="destination">Dirección destino</label>
            <input
              id="destination"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder={`${ADDRESS_PREFIX}1…`}
              required
            />
            <label htmlFor="amount">Monto ({DISPLAY_DENOM})</label>
            <input
              id="amount"
              type="number"
              min="0"
              step="0.000001"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              required
            />
            <label htmlFor="memo">Memo (opcional)</label>
            <input id="memo" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Referencia opcional" />

            {sendError ? <div className="error inline">{sendError}</div> : null}
            {sendResult ? (
              <div className="success">
                <p>Transacción enviada. Hash: {sendResult.hash}</p>
                <a href={`${EXPLORER_BASE_URL}${sendResult.hash}`} target="_blank" rel="noreferrer">
                  Ver en explorer
                </a>
              </div>
            ) : null}

            <button type="submit" className="primary" disabled={isSending}>
              Revisar y confirmar
            </button>
          </form>

          {showConfirm ? (
            <div className="confirm">
              <h3>Confirmar envío</h3>
              <p>
                Vas a enviar <strong>{amountInput} {DISPLAY_DENOM}</strong> a <strong>{destination}</strong>.
              </p>
              <p>Fee estimado: {feeDisplay} {DISPLAY_DENOM}</p>
              <p>Total aproximado: {generateTotal(Number(amountInput), feeAmount)} {DISPLAY_DENOM}</p>
              <button type="button" className="primary" onClick={handleSend} disabled={isSending}>
                {isSending ? 'Enviando…' : 'Confirmar y enviar'}
              </button>
              <button
                type="button"
                className="link"
                onClick={() => {
                  setShowConfirm(false)
                  setFeeAmount(0)
                }}
              >
                Cancelar
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeWallet ? (
        <section className="card">
          <h2>Recibir tokens</h2>
          <p>Compartí esta dirección para recibir fondos. Recordá respetar los {DISPLAY_DECIMALS} decimales ({DISPLAY_DENOM}).</p>
          <div className="receive">
            <QRCodeSVG value={activeWallet.address} includeMargin size={180} />
            <div className="receive-info">
              <p className="address">{activeWallet.address}</p>
              <button type="button" className="secondary" onClick={handleCopyAddress}>
                Copiar dirección
              </button>
              <small>{CONFIRMATION_GUIDANCE}</small>
            </div>
          </div>
        </section>
      ) : null}

      <footer>
        <h2>Checklist de QA</h2>
        <ul>
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
  )
}

export default App
