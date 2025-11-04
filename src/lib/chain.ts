export const DEFAULT_CHAIN_ID = 'plt-test0'
export const DEFAULT_RPC = 'http://localhost:26657'

export const DENOM = 'uplt'
export const DENOM_DISPLAY = 'PLT'
export const DENOM_DECIMALS = 6

export const BECH32_PREFIX = 'plt'

export function formatAmount(amount: string, decimals: number): string {
  if (!amount) {
    return '0'
  }

  if (decimals <= 0) {
    return amount
  }

  const negative = amount.startsWith('-')
  const digits = negative ? amount.slice(1) : amount
  const padded = digits.padStart(decimals + 1, '0')
  const integerPart = padded.slice(0, -decimals) || '0'
  const fractionalPart = padded.slice(-decimals).padEnd(decimals, '0')
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '') || '0'
  const formatted = `${normalizedInteger}.${fractionalPart}`

  return negative ? `-${formatted}` : formatted
}
