import type { FormEvent } from 'react'

interface ConnectViewProps {
  rpcUrl: string
  onRpcUrlChange: (value: string) => void
  expectedChainId: string
  onExpectedChainIdChange: (value: string) => void
  chainId: string | null
  height: number
  isConnected: boolean
  error: string | null
  onConnect: () => Promise<void>
  onDisconnect: () => void
}

export function ConnectView({
  rpcUrl,
  onRpcUrlChange,
  expectedChainId,
  onExpectedChainIdChange,
  chainId,
  height,
  isConnected,
  error,
  onConnect,
  onDisconnect,
}: ConnectViewProps) {
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onConnect()
  }

  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-2xl shadow-blue-900/30 backdrop-blur-sm">
      <h2 className="text-xl font-semibold text-slate-100">Conexión RPC</h2>
      <p className="mt-1 text-sm text-slate-400">
        Configurá la URL del nodo y conectate para obtener información en vivo.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <label htmlFor="rpcUrl" className="text-sm font-medium text-slate-200">
            RPC URL
          </label>
          <input
            id="rpcUrl"
            type="url"
            value={rpcUrl}
            onChange={(event) => onRpcUrlChange(event.target.value)}
            placeholder="http://localhost:26657"
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-plt-primary focus:outline-none focus:ring-2 focus:ring-plt-primary/40"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="chainId" className="text-sm font-medium text-slate-200">
            Chain ID esperado
          </label>
          <input
            id="chainId"
            type="text"
            value={expectedChainId}
            onChange={(event) => onExpectedChainIdChange(event.target.value)}
            placeholder="plt-local"
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-plt-primary focus:outline-none focus:ring-2 focus:ring-plt-primary/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isConnected}
            className="inline-flex items-center justify-center rounded-lg border border-slate-500/40 bg-[#0077ff] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-700"
          >
            {isConnected ? 'Conectado' : 'Conectar'}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            disabled={!isConnected}
            className="inline-flex items-center justify-center rounded-lg border border-slate-600 bg-transparent px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500"
          >
            Desconectar
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-2 text-sm">
        <p className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
          <span className="text-slate-400">Estado</span>
          <span className={isConnected ? 'text-emerald-400' : error ? 'text-rose-400' : 'text-slate-300'}>
            {isConnected ? 'Conectado' : error ? 'Error' : 'Desconectado'}
          </span>
        </p>
        <p className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
          <span className="text-slate-400">Chain ID detectado</span>
          <span className="text-slate-200">{chainId ?? '—'}</span>
        </p>
        <p className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2">
          <span className="text-slate-400">Altura de bloque</span>
          <span className="text-slate-200">{height > 0 ? height : '—'}</span>
        </p>
        {error && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-200">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

export default ConnectView
