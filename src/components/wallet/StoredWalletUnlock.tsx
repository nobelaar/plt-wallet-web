import { useState } from 'react'

interface StoredWalletUnlockProps {
  onUnlock: (password: string) => Promise<void> | void
  onForget: () => void
  loading?: boolean
  error?: string | null
  theme?: 'light' | 'dark'
}

export function StoredWalletUnlock({ onUnlock, onForget, loading = false, error, theme = 'dark' }: StoredWalletUnlockProps) {
  const [password, setPassword] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onUnlock(password)
  }

  const isLight = theme === 'light'
  const labelClass = isLight ? 'text-sm font-semibold uppercase tracking-wide text-slate-600' : 'text-sm font-semibold uppercase tracking-wide text-slate-200'
  const inputClass = isLight
    ? 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200'
    : 'w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20'
  const errorClass = isLight
    ? 'rounded-xl border border-rose-500/25 bg-rose-50 px-3 py-2 text-sm text-rose-600'
    : 'rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200'
  const primaryButtonClass = isLight
    ? 'inline-flex flex-1 items-center justify-center rounded-xl border border-sky-300 bg-gradient-to-r from-sky-300 via-indigo-300 to-emerald-300 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-200/70 transition hover:shadow-slate-300/80 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400'
    : 'inline-flex flex-1 items-center justify-center rounded-xl border border-white/30 bg-gradient-to-r from-[#ff8a8a] via-[#8a8aff] to-[#6affc0] px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-purple-500/30 transition hover:shadow-purple-500/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-300'
  const secondaryButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400'
    : 'inline-flex items-center justify-center rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-400'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="unlock-password" className={labelClass}>
          Contraseña
        </label>
        <input
          id="unlock-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
          placeholder="Contraseña de cifrado"
          required
          disabled={loading}
        />
      </div>

      {error ? <p className={errorClass}>{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className={primaryButtonClass}
        >
          {loading ? 'Desbloqueando…' : 'Desbloquear'}
        </button>
        <button
          type="button"
          onClick={onForget}
          disabled={loading}
          className={secondaryButtonClass}
        >
          Olvidar wallet
        </button>
      </div>
    </form>
  )
}

export default StoredWalletUnlock
