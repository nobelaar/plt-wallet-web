import { useCallback, useEffect, useState } from 'react'

import BalancePanel from './components/BalancePanel'
import ConnectView from './components/ConnectView'
import { CHAIN_ID_STORAGE_KEY, RPC_STORAGE_KEY, usePlt } from './hooks/usePlt'
import { DEFAULT_CHAIN_ID, DEFAULT_RPC } from './lib/chain'

function App() {
  const [rpcUrl, setRpcUrl] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_RPC
    }
    return window.localStorage.getItem(RPC_STORAGE_KEY) ?? DEFAULT_RPC
  })

  const [expectedChainId, setExpectedChainId] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_CHAIN_ID
    }
    return window.localStorage.getItem(CHAIN_ID_STORAGE_KEY) ?? DEFAULT_CHAIN_ID
  })

  const { client, chainId, height, isConnected, error, connect, disconnect } = usePlt(
    rpcUrl,
    expectedChainId,
  )

  const handleConnect = useCallback(async () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RPC_STORAGE_KEY, rpcUrl)
      window.localStorage.setItem(CHAIN_ID_STORAGE_KEY, expectedChainId)
    }
    await connect()
  }, [connect, expectedChainId, rpcUrl])

  useEffect(() => {
    if (!chainId) {
      return
    }

    setExpectedChainId((current) => {
      if (current === chainId) {
        return current
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CHAIN_ID_STORAGE_KEY, chainId)
      }
      return chainId
    })
  }, [chainId])

  return (
    <div className="min-h-screen bg-[#0a0f1c] text-slate-200">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-4 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100">PLT Wallet (Web)</h1>
          <p className="mt-2 text-sm text-slate-400">
            Conectate a un endpoint RPC de Cosmos y explorá balances del token PLT.
          </p>
        </header>

        <div className="flex flex-col gap-8">
          <ConnectView
            rpcUrl={rpcUrl}
            onRpcUrlChange={setRpcUrl}
            expectedChainId={expectedChainId}
            onExpectedChainIdChange={setExpectedChainId}
            chainId={chainId}
            height={height}
            isConnected={isConnected}
            error={error}
            onConnect={handleConnect}
            onDisconnect={disconnect}
          />

          <BalancePanel client={client} />
        </div>
      </div>
    </div>
  )
}

export default App
