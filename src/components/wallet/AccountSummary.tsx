import { QRCodeSVG } from 'qrcode.react'

import type { ActiveWallet } from '../../lib/wallet'
import { CONFIRMATION_GUIDANCE, DISPLAY_DENOM } from '../../config'

interface AccountSummaryProps {
  wallet: ActiveWallet
  balance: string
  onCopy: () => void
}

export function AccountSummary({ wallet, balance, onCopy }: AccountSummaryProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
      <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-indigo-500/20">
        <h3 className="text-lg font-semibold text-white">Resumen de cuenta</h3>
        <div className="space-y-2 text-sm">
          <p className="text-slate-300">Dirección</p>
          <p className="break-all rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 font-mono text-sm text-slate-100">
            {wallet.address}
          </p>
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-slate-300">Balance disponible</p>
          <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-lg font-semibold text-emerald-200">
            {balance} {DISPLAY_DENOM}
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-gradient-to-r from-[#ff8a8a] via-[#8a8aff] to-[#6affc0] px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-purple-500/30 transition hover:shadow-purple-500/50"
        >
          Copiar dirección
        </button>
      </div>

      <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-center shadow-lg shadow-indigo-500/20">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Recibir tokens</h4>
        <QRCodeSVG value={wallet.address} includeMargin size={160} />
        <p className="text-xs text-slate-400">{CONFIRMATION_GUIDANCE}</p>
      </div>
    </div>
  )
}

export default AccountSummary
