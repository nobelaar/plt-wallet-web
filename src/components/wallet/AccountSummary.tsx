import { QRCodeSVG } from 'qrcode.react'

import type { ActiveWallet } from '../../lib/wallet'
import { CONFIRMATION_GUIDANCE, DISPLAY_DENOM } from '../../config'

interface AccountSummaryProps {
  wallet: ActiveWallet
  balance: string
  onCopy: () => void
  theme?: 'light' | 'dark'
  onRefreshBalance?: () => Promise<void> | void
  refreshingBalance?: boolean
}

export function AccountSummary({
  wallet,
  balance,
  onCopy,
  theme = 'dark',
  onRefreshBalance,
  refreshingBalance = false,
}: AccountSummaryProps) {
  const isLight = theme === 'light'
  const infoCardClass = isLight
    ? 'space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-md shadow-slate-200/50'
    : 'space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-indigo-500/20'
  const headingClass = isLight ? 'text-lg font-semibold text-slate-900' : 'text-lg font-semibold text-white'
  const labelClass = isLight ? 'text-slate-600' : 'text-slate-300'
  const valueBoxClass = isLight
    ? 'break-all rounded-xl border border-slate-200 bg-white/80 px-3 py-2 font-mono text-sm text-slate-800 shadow-inner'
    : 'break-all rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-100'
  const balanceBoxClass = isLight
    ? 'rounded-xl border border-emerald-400/40 bg-emerald-50 px-3 py-2 text-lg font-semibold text-emerald-600'
    : 'rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-lg font-semibold text-emerald-200'
  const copyButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-gradient-to-r from-sky-200 via-indigo-200 to-emerald-200 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-200/60 transition hover:shadow-slate-300/70'
    : 'inline-flex items-center justify-center rounded-xl border border-white/30 bg-gradient-to-r from-[#ff8a8a] via-[#8a8aff] to-[#6affc0] px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-purple-500/30 transition hover:shadow-purple-500/50'
  const sideCardClass = isLight
    ? 'flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/90 p-6 text-center shadow-md shadow-slate-200/50'
    : 'flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center shadow-lg shadow-indigo-500/20'
  const sideHeadingClass = isLight ? 'text-sm font-semibold uppercase tracking-wide text-slate-600' : 'text-sm font-semibold uppercase tracking-wide text-slate-200'
  const guidanceClass = isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-400'
  const refreshButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400'
    : 'inline-flex items-center justify-center rounded-xl border border-white/20 bg-transparent px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500'

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
      <div className={infoCardClass}>
        <h3 className={headingClass}>Resumen de cuenta</h3>
        <div className="space-y-2 text-sm">
          <p className={labelClass}>Dirección</p>
          <p className={valueBoxClass}>{wallet.address}</p>
        </div>
        <div className="space-y-2 text-sm">
          <p className={labelClass}>Balance disponible</p>
          <p className={balanceBoxClass}>
            {balance} {DISPLAY_DENOM}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onCopy}
            className={copyButtonClass}
          >
            Copiar dirección
          </button>
          {onRefreshBalance ? (
            <button
              type="button"
              onClick={onRefreshBalance}
              className={refreshButtonClass}
              disabled={refreshingBalance}
            >
              {refreshingBalance ? 'Actualizando…' : 'Actualizar balance'}
            </button>
          ) : null}
        </div>
      </div>

      <div className={sideCardClass}>
        <h4 className={sideHeadingClass}>Recibir tokens</h4>
        <QRCodeSVG value={wallet.address} includeMargin size={160} />
        <p className={guidanceClass}>{CONFIRMATION_GUIDANCE}</p>
      </div>
    </div>
  )
}

export default AccountSummary
