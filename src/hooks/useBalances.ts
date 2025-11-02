import { useCallback, useState } from 'react'
import type { StargateClient } from '@cosmjs/stargate'

import { BECH32_PREFIX } from '../lib/chain'

export type Balance = { denom: string; amount: string }

const ADDRESS_STORAGE_KEY = 'plt:lastAddress'

export function useBalances(client: StargateClient | null) {
  const [loading, setLoading] = useState(false)
  const [balances, setBalances] = useState<Balance[]>([])
  const [error, setError] = useState<string | null>(null)

  const fetchBalances = useCallback(
    async (address: string) => {
      const trimmed = address.trim()

      if (!trimmed) {
        setError('La dirección es obligatoria.')
        setBalances([])
        return
      }

      if (trimmed && !trimmed.startsWith(`${BECH32_PREFIX}1`)) {
        setError(`La dirección debe comenzar con ${BECH32_PREFIX}1.`)
        setBalances([])
        return
      }

      if (!client) {
        setError('Conectate a un RPC primero.')
        setBalances([])
        return
      }

      setLoading(true)
      setError(null)

      try {
        const coins = await client.getAllBalances(trimmed)
        const sorted = [...coins].sort((a, b) => a.denom.localeCompare(b.denom))
        setBalances(sorted.map((coin) => ({ denom: coin.denom, amount: coin.amount })))

        if (typeof window !== 'undefined') {
          window.localStorage.setItem(ADDRESS_STORAGE_KEY, trimmed)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudieron obtener los balances.'
        setError(message)
        setBalances([])
      } finally {
        setLoading(false)
      }
    },
    [client],
  )

  return { loading, balances, error, fetchBalances }
}

export function getStoredAddress() {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.localStorage.getItem(ADDRESS_STORAGE_KEY) ?? ''
}
