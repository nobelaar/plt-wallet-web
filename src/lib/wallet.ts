import { DirectSecp256k1HdWallet, DirectSecp256k1Wallet } from '@cosmjs/proto-signing'
import { SigningStargateClient, GasPrice } from '@cosmjs/stargate'
import { fromHex } from '@cosmjs/encoding'
import { validateMnemonic } from 'bip39'

import {
  ADDRESS_PREFIX,
  BASE_DENOM,
  CHAIN_ID,
  DEFAULT_GAS_PRICE,
  DISPLAY_DECIMALS,
  DISPLAY_DENOM,
  EXPLORER_BASE_URL,
  RPC_ENDPOINT,
  STORAGE_KEY,
} from '../config'

export type WalletSource = 'mnemonic' | 'privateKey'

export interface ActiveWallet {
  address: string
  signer: DirectSecp256k1HdWallet | DirectSecp256k1Wallet
  type: WalletSource
}

export interface EncryptedWalletShape {
  address: string
  type: WalletSource
  ciphertext: string
  iv: string
  salt: string
}

export interface StoredSecrets {
  mnemonic?: string
  privateKeyHex?: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const gasPrice = GasPrice.fromString(DEFAULT_GAS_PRICE)

const ADDRESS_REGEX = new RegExp(`^${ADDRESS_PREFIX}1[0-9a-z]{38,58}$`)

export async function deriveKey(password: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
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

export async function encryptSecrets(
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

export async function decryptSecrets(payload: EncryptedWalletShape, password: string): Promise<StoredSecrets> {
  const salt = base64ToBuffer(payload.salt)
  const iv = base64ToBuffer(payload.iv)
  const ciphertext = base64ToBuffer(payload.ciphertext)
  const key = await deriveKey(password, salt)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  const json = decoder.decode(decrypted)
  return JSON.parse(json) as StoredSecrets
}

export function getStoredWallet(): EncryptedWalletShape | null {
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

export function persistWallet(payload: EncryptedWalletShape) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...payload,
    }),
  )
}

export function clearPersistedWallet() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export function validatePrivateKeyHex(value: string) {
  return /^[0-9a-fA-F]{64}$/.test(value.trim())
}

export function shortenAddress(address: string) {
  return `${address.slice(0, 10)}…${address.slice(-7)}`
}

export function formatAmount(amount: string | undefined): string {
  if (!amount) return '0'
  const value = Number(amount) / 10 ** DISPLAY_DECIMALS
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: DISPLAY_DECIMALS,
  })
}

export function generateTotal(amount: number, fee: number) {
  return (amount + fee).toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: DISPLAY_DECIMALS,
  })
}

export function isValidAddress(address: string) {
  return ADDRESS_REGEX.test(address.trim())
}

export async function createSignerFromMnemonic(mnemonic: string) {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!validateMnemonic(normalized)) {
    throw new Error('Mnemonic inválido — revisá las palabras y los espacios.')
  }
  const signer = await DirectSecp256k1HdWallet.fromMnemonic(normalized, {
    prefix: ADDRESS_PREFIX,
  })
  const accounts = await signer.getAccounts()
  const address = accounts[0]?.address ?? ''
  if (!address) {
    throw new Error('No se pudo derivar la dirección de la wallet.')
  }
  return {
    signer,
    address,
    secrets: { mnemonic: normalized } satisfies StoredSecrets,
    type: 'mnemonic' as const,
  }
}

export async function createSignerFromPrivateKey(privateKeyHex: string) {
  const cleaned = privateKeyHex.trim()
  if (!validatePrivateKeyHex(cleaned)) {
    throw new Error('Clave privada inválida — revisá el formato.')
  }
  const keyBytes = fromHex(cleaned)
  const signer = await DirectSecp256k1Wallet.fromKey(keyBytes, ADDRESS_PREFIX)
  const accounts = await signer.getAccounts()
  const address = accounts[0]?.address ?? ''
  if (!address) {
    throw new Error('No se pudo derivar la dirección de la wallet.')
  }
  return {
    signer,
    address,
    secrets: { privateKeyHex: cleaned } satisfies StoredSecrets,
    type: 'privateKey' as const,
  }
}

export async function instantiateSigningClient(
  rpcUrl: string,
  signer: ActiveWallet['signer'],
  expectedChainId: string = CHAIN_ID,
) {
  const signingClient = await SigningStargateClient.connectWithSigner(rpcUrl || RPC_ENDPOINT, signer, { gasPrice })
  const remoteChainId = await signingClient.getChainId()
  if (remoteChainId !== expectedChainId) {
    await signingClient.disconnect()
    throw new Error(`Se esperaba chain-id ${expectedChainId} pero la red respondió ${remoteChainId}.`)
  }
  return signingClient
}

export const DEFAULT_CHAIN = {
  rpcUrl: RPC_ENDPOINT,
  chainId: CHAIN_ID,
  denom: DISPLAY_DENOM,
  denomDecimals: DISPLAY_DECIMALS,
  explorerBaseUrl: EXPLORER_BASE_URL,
  baseDenom: BASE_DENOM,
}
