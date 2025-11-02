import { useCallback, useEffect, useState } from 'react'
import { StargateClient } from '@cosmjs/stargate'

export const RPC_STORAGE_KEY = 'plt:rpcUrl'
export const CHAIN_ID_STORAGE_KEY = 'plt:chainId'

export interface UsePltResult {
  client: StargateClient | null
  chainId: string | null
  height: number
  isConnected: boolean
  error: string | null
  connect: () => Promise<void>
  disconnect: () => void
}

export function usePlt(rpcUrl: string, initialChainId?: string): UsePltResult {
  const [client, setClient] = useState<StargateClient | null>(null)
  const [chainId, setChainId] = useState<string | null>(initialChainId ?? null)
  const [height, setHeight] = useState<number>(0)
  const [isConnected, setIsConnected] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') {
      if (initialChainId) {
        setChainId(initialChainId)
      }
      return
    }

    const savedChainId = window.localStorage.getItem(CHAIN_ID_STORAGE_KEY)
    if (savedChainId) {
      setChainId(savedChainId)
    } else if (initialChainId) {
      setChainId(initialChainId)
    }
  }, [initialChainId])

  useEffect(() => {
    return () => {
      if (client) {
        client.disconnect().catch(() => undefined)
      }
    }
  }, [client])

  const connect = useCallback(async () => {
    setError(null)
    setIsConnected(false)
    setHeight(0)

    if (!rpcUrl) {
      setError('La URL de RPC es obligatoria.')
      return
    }

    let nextClient: StargateClient | null = null

    try {
      if (client) {
        await client.disconnect()
        setClient(null)
      }

      nextClient = await StargateClient.connect(rpcUrl)
      const detectedChainId = await nextClient.getChainId()
      const currentHeight = await nextClient.getHeight()

      setClient(nextClient)
      setChainId(detectedChainId)
      setHeight(currentHeight)
      setIsConnected(true)

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RPC_STORAGE_KEY, rpcUrl)
        window.localStorage.setItem(CHAIN_ID_STORAGE_KEY, detectedChainId)
      }
    } catch (err) {
      if (nextClient) {
        await nextClient.disconnect().catch(() => undefined)
      } else if (client) {
        await client.disconnect().catch(() => undefined)
      }
      setClient(null)
      setChainId(initialChainId ?? null)
      setHeight(0)
      setIsConnected(false)
      const message = err instanceof Error ? err.message : 'No se pudo conectar al RPC.'
      setError(message)
    }
  }, [client, rpcUrl, initialChainId])

  const disconnect = useCallback(() => {
    if (client) {
      client.disconnect().catch(() => undefined)
    }
    setClient(null)
    setChainId(initialChainId ?? null)
    setIsConnected(false)
    setHeight(0)
    setError(null)
  }, [client, initialChainId])

  return { client, chainId, height, isConnected, error, connect, disconnect }
}
