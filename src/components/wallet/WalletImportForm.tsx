import { useState } from 'react'

import type { WalletSource } from '../../lib/wallet'

export interface WalletImportPayload {
  type: WalletSource
  mnemonic?: string
  privateKey?: string
  password?: string
  persist: boolean
  name?: string
}

interface WalletImportFormProps {
  onSubmit: (payload: WalletImportPayload) => Promise<void> | void
  disabled?: boolean
  loading?: boolean
  theme?: 'light' | 'dark'
}

export function WalletImportForm({ onSubmit, disabled = false, loading = false, theme = 'dark' }: WalletImportFormProps) {
  const [walletType, setWalletType] = useState<WalletSource>('mnemonic')
  const [mnemonic, setMnemonic] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [password, setPassword] = useState('')
  const [persist, setPersist] = useState(false)
  const [name, setName] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled) return
    await onSubmit({
      type: walletType,
      mnemonic: walletType === 'mnemonic' ? mnemonic : undefined,
      privateKey: walletType === 'privateKey' ? privateKey : undefined,
      password: persist ? password : undefined,
      persist,
      name: name.trim() ? name.trim() : undefined,
    })
  }

  const isLight = theme === 'light'
  const labelClass = isLight ? 'text-sm font-semibold uppercase tracking-wide text-slate-600' : 'text-sm font-semibold uppercase tracking-wide text-slate-200'
  const selectClass = isLight
    ? 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200'
    : 'w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20'
  const checkboxWrapperClass = isLight
    ? 'flex items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600'
    : 'flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200'
  const checkboxClass = isLight
    ? 'h-4 w-4 rounded border-slate-400 bg-white text-emerald-500 focus:ring-emerald-300'
    : 'h-4 w-4 rounded border-white/20 bg-slate-950 text-emerald-400 focus:ring-emerald-300'
  const textareaClass = isLight
    ? 'min-h-[120px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200'
    : 'min-h-[120px] w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20'
  const inputClass = isLight
    ? 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200'
    : 'w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20'
  const hintClass = isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-400'
  const submitClass = isLight
    ? 'w-full rounded-xl border border-sky-300 bg-gradient-to-r from-sky-300 via-indigo-300 to-emerald-300 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-200/70 transition hover:shadow-slate-300/80 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400'
    : 'w-full rounded-xl border border-white/30 bg-gradient-to-r from-[#ff8a8a] via-[#8a8aff] to-[#6affc0] px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-purple-500/30 transition hover:shadow-purple-500/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-300'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="wallet-name" className={labelClass}>
          Nombre (opcional)
        </label>
        <input
          id="wallet-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
          placeholder="Ej. Billetera principal"
          disabled={disabled || loading}
        />
        <p className={hintClass}>El nombre te ayuda a identificar la wallet en la lista.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="wallet-type" className={labelClass}>
            Tipo de clave
          </label>
          <select
            id="wallet-type"
            value={walletType}
            onChange={(event) => setWalletType(event.target.value as WalletSource)}
            className={selectClass}
            disabled={disabled || loading}
          >
            <option value="mnemonic">Mnemonic BIP39</option>
            <option value="privateKey">Clave privada hex</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="persist" className={labelClass}>
            Guardado local
          </label>
          <div className={checkboxWrapperClass}>
            <input
              id="persist"
              type="checkbox"
              checked={persist}
              onChange={(event) => setPersist(event.target.checked)}
              className={checkboxClass}
              disabled={disabled || loading}
            />
            <span>Guardar cifrada en este navegador</span>
          </div>
        </div>
      </div>

      {walletType === 'mnemonic' ? (
        <div className="space-y-2">
          <label htmlFor="mnemonic" className={labelClass}>
            Mnemonic
          </label>
          <textarea
            id="mnemonic"
            value={mnemonic}
            onChange={(event) => setMnemonic(event.target.value)}
            className={textareaClass}
            placeholder="palabra1 palabra2 ... palabra24"
            disabled={disabled || loading}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor="privateKey" className={labelClass}>
            Clave privada (hex)
          </label>
          <input
            id="privateKey"
            value={privateKey}
            onChange={(event) => setPrivateKey(event.target.value)}
            className={inputClass}
            placeholder="64 caracteres hexadecimales"
            disabled={disabled || loading}
          />
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="password" className={labelClass}>
          Contraseña para cifrar (opcional)
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
          placeholder="Mínimo 8 caracteres"
          disabled={!persist || disabled || loading}
        />
        <p className={hintClass}>Si activás el guardado local, ciframos la wallet con esta contraseña antes de almacenarla.</p>
      </div>

      <button
        type="submit"
        disabled={disabled || loading}
        className={submitClass}
      >
        {loading ? 'Importando…' : 'Importar wallet'}
      </button>
    </form>
  )
}

export default WalletImportForm
