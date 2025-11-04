import { useState } from 'react'

interface StoredWalletUnlockProps {
  onUnlock: (password: string) => Promise<void> | void
  onForget: () => void
  loading?: boolean
  error?: string | null
}

export function StoredWalletUnlock({ onUnlock, onForget, loading = false, error }: StoredWalletUnlockProps) {
  const [password, setPassword] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onUnlock(password)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="unlock-password" className="text-sm font-semibold uppercase tracking-wide text-slate-200">
          Contraseña
        </label>
        <input
          id="unlock-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
          placeholder="Contraseña de cifrado"
          required
          disabled={loading}
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-white/30 bg-gradient-to-r from-[#ff8a8a] via-[#8a8aff] to-[#6affc0] px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-purple-500/30 transition hover:shadow-purple-500/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-300"
        >
          {loading ? 'Desbloqueando…' : 'Desbloquear'}
        </button>
        <button
          type="button"
          onClick={onForget}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-400"
        >
          Olvidar wallet
        </button>
      </div>
    </form>
  )
}

export default StoredWalletUnlock
