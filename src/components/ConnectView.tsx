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
  theme?: 'light' | 'dark'
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
  theme = 'dark',
}: ConnectViewProps) {
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onConnect()
  }

  const isLight = theme === 'light'
  const sectionClass = isLight
    ? 'rounded-2xl border border-slate-200 bg-white/85 p-6 shadow-lg shadow-slate-200/50 backdrop-blur-sm'
    : 'rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-2xl shadow-blue-900/30 backdrop-blur-sm'
  const headingClass = isLight ? 'text-xl font-semibold text-slate-900' : 'text-xl font-semibold text-slate-100'
  const descriptionClass = isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-400'
  const labelClass = isLight ? 'text-sm font-medium text-slate-700' : 'text-sm font-medium text-slate-200'
  const inputClass = isLight
    ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200'
    : 'w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-plt-primary focus:outline-none focus:ring-2 focus:ring-plt-primary/40'
  const primaryButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-lg border border-sky-300 bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400'
    : 'inline-flex items-center justify-center rounded-lg border border-slate-500/40 bg-[#0077ff] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-700'
  const secondaryButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400'
    : 'inline-flex items-center justify-center rounded-lg border border-slate-600 bg-transparent px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:border-slate-700 disabled:text-slate-500'
  const statusRowClass = isLight
    ? 'flex items-center justify-between rounded-lg border border-slate-200 bg-white/80 px-3 py-2'
    : 'flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2'
  const stateLabelClass = isLight ? 'text-slate-500' : 'text-slate-400'
  const stateValueClass = isLight ? 'text-slate-700' : 'text-slate-200'
  const errorClass = isLight
    ? 'rounded-lg border border-rose-500/25 bg-rose-50 px-3 py-2 text-rose-600'
    : 'rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-rose-200'

  return (
    <section className={sectionClass}>
      <h2 className={headingClass}>Conexión RPC</h2>
      <p className={descriptionClass}>Configurá la URL del nodo y conectate para obtener información en vivo.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <label htmlFor="rpcUrl" className={labelClass}>
            RPC URL
          </label>
          <input
            id="rpcUrl"
            type="url"
            value={rpcUrl}
            onChange={(event) => onRpcUrlChange(event.target.value)}
            placeholder="http://localhost:26657"
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="chainId" className={labelClass}>
            Chain ID esperado
          </label>
          <input
            id="chainId"
            type="text"
            value={expectedChainId}
            onChange={(event) => onExpectedChainIdChange(event.target.value)}
            placeholder="plt-local"
            className={inputClass}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={isConnected}
            className={primaryButtonClass}
          >
            {isConnected ? 'Conectado' : 'Conectar'}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            disabled={!isConnected}
            className={secondaryButtonClass}
          >
            Desconectar
          </button>
        </div>
      </form>

      <div className="mt-6 space-y-2 text-sm">
        <p className={statusRowClass}>
          <span className={stateLabelClass}>Estado</span>
          <span className={isConnected ? (isLight ? 'text-emerald-600' : 'text-emerald-400') : error ? 'text-rose-500' : stateValueClass}>
            {isConnected ? 'Conectado' : error ? 'Error' : 'Desconectado'}
          </span>
        </p>
        <p className={statusRowClass}>
          <span className={stateLabelClass}>Chain ID detectado</span>
          <span className={stateValueClass}>{chainId ?? '—'}</span>
        </p>
        <p className={statusRowClass}>
          <span className={stateLabelClass}>Altura de bloque</span>
          <span className={stateValueClass}>{height > 0 ? height : '—'}</span>
        </p>
        {error && (
          <p className={errorClass}>{error}</p>
        )}
      </div>
    </section>
  )
}

export default ConnectView
