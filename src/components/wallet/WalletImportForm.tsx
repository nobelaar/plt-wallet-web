import { useState } from 'react'

import type { WalletSource } from '../../lib/wallet'

export interface WalletImportPayload {
  type: WalletSource
  mnemonic?: string
  privateKey?: string
  password?: string
  persist: boolean
}

interface WalletImportFormProps {
  onSubmit: (payload: WalletImportPayload) => Promise<void> | void
  disabled?: boolean
  loading?: boolean
}

export function WalletImportForm({ onSubmit, disabled = false, loading = false }: WalletImportFormProps) {
  const [walletType, setWalletType] = useState<WalletSource>('mnemonic')
  const [mnemonic, setMnemonic] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [password, setPassword] = useState('')
  const [persist, setPersist] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled) return
    await onSubmit({
      type: walletType,
      mnemonic: walletType === 'mnemonic' ? mnemonic : undefined,
      privateKey: walletType === 'privateKey' ? privateKey : undefined,
      password: persist ? password : undefined,
      persist,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="wallet-type" className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            Tipo de clave
          </label>
          <select
            id="wallet-type"
            value={walletType}
            onChange={(event) => setWalletType(event.target.value as WalletSource)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            disabled={disabled || loading}
          >
            <option value="mnemonic">Mnemonic BIP39</option>
            <option value="privateKey">Clave privada hex</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="persist" className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            Guardado local
          </label>
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
            <input
              id="persist"
              type="checkbox"
              checked={persist}
              onChange={(event) => setPersist(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-400 focus:ring-emerald-300"
              disabled={disabled || loading}
            />
            <span>Guardar cifrada en este navegador</span>
          </div>
        </div>
      </div>

      {walletType === 'mnemonic' ? (
        <div className="space-y-2">
          <label htmlFor="mnemonic" className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            Mnemonic
          </label>
          <textarea
            id="mnemonic"
            value={mnemonic}
            onChange={(event) => setMnemonic(event.target.value)}
            className="min-h-[120px] w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            placeholder="palabra1 palabra2 ... palabra24"
            disabled={disabled || loading}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor="privateKey" className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            Clave privada (hex)
          </label>
          <input
            id="privateKey"
            value={privateKey}
            onChange={(event) => setPrivateKey(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            placeholder="64 caracteres hexadecimales"
            disabled={disabled || loading}
          />
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-semibold uppercase tracking-wide text-slate-200">
          Contraseña para cifrar (opcional)
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
          placeholder="Mínimo 8 caracteres"
          disabled={!persist || disabled || loading}
        />
        <p className="text-xs text-slate-400">
          Si activás el guardado local, ciframos la wallet con esta contraseña antes de almacenarla.
        </p>
      </div>

      <button
        type="submit"
        disabled={disabled || loading}
        className="w-full rounded-xl border border-white/30 bg-gradient-to-r from-[#ff8a8a] via-[#8a8aff] to-[#6affc0] px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-purple-500/30 transition hover:shadow-purple-500/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-300"
      >
        {loading ? 'Importando…' : 'Importar wallet'}
      </button>
    </form>
  )
}

export default WalletImportForm
