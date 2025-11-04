import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { StargateClient } from '@cosmjs/stargate'

import { DENOM, DENOM_DECIMALS, DENOM_DISPLAY, formatAmount } from '../lib/chain'
import { getStoredAddress, useBalances } from '../hooks/useBalances'

interface BalancePanelProps {
  client: StargateClient | null
  theme?: 'light' | 'dark'
}

export function BalancePanel({ client, theme = 'dark' }: BalancePanelProps) {
  const [address, setAddress] = useState<string>(() => getStoredAddress() || '')
  const { loading, balances, error, fetchBalances } = useBalances(client)

  const hasBalances = balances.length > 0
  const isClientReady = Boolean(client)

  const subtitle = useMemo(() => {
    if (!isClientReady) {
      return 'Conectate a un RPC primero para consultar balances.'
    }
    return 'Ingresá una dirección válida para ver sus balances disponibles.'
  }, [isClientReady])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await fetchBalances(address)
  }

  const isLight = theme === 'light'
  const sectionClass = isLight
    ? 'h-full rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-lg shadow-slate-200/50 backdrop-blur-sm'
    : 'h-full rounded-2xl border border-slate-700/60 bg-slate-900/40 p-6 shadow-xl shadow-blue-900/20 backdrop-blur-sm'
  const headingClass = isLight ? 'text-lg font-semibold text-slate-900' : 'text-lg font-semibold text-slate-100'
  const subtitleClass = isLight ? 'text-sm text-slate-500' : 'text-sm text-slate-400'
  const labelClass = isLight ? 'text-sm font-medium text-slate-700' : 'text-sm font-medium text-slate-200'
  const inputClass = isLight
    ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200'
    : 'w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-plt-primary focus:outline-none focus:ring-2 focus:ring-plt-primary/40'
  const buttonClass = isLight
    ? 'inline-flex items-center justify-center rounded-lg border border-sky-300 bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400'
    : 'inline-flex items-center justify-center rounded-lg border border-slate-500/40 bg-[#0077ff] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-700'
  const errorClass = isLight
    ? 'mt-4 rounded-lg border border-rose-500/25 bg-rose-50 px-3 py-2 text-sm text-rose-600'
    : 'mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200'
  const emptyClass = isLight
    ? 'mt-4 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-500'
    : 'mt-4 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-300'
  const balanceItemClass = isLight
    ? 'flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-inner'
    : 'flex flex-col gap-1 rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-sm text-slate-200 shadow-inner'
  const denomClass = isLight ? 'font-medium text-slate-900' : 'font-medium text-slate-100'
  const amountClass = isLight ? 'tabular-nums text-slate-700' : 'tabular-nums text-slate-200'
  const approxClass = isLight ? 'text-xs text-slate-500' : 'text-xs text-slate-400'

  return (
    <section className={sectionClass}>
      <div className="flex flex-col gap-1">
        <h2 className={headingClass}>Balances</h2>
        <p className={subtitleClass}>{subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="space-y-2">
          <label htmlFor="address" className={labelClass}>
            Dirección
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="plt1..."
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={!isClientReady || loading}
          className={buttonClass}
        >
          {loading ? 'Consultando...' : 'Consultar'}
        </button>
      </form>

      {error && <p className={errorClass}>{error}</p>}

      {!error && !loading && !hasBalances && <p className={emptyClass}>Ingresá una dirección para ver balances disponibles.</p>}

      {hasBalances && (
        <ul className="mt-6 space-y-3">
          {balances.map((balance) => {
            const isNativeDenom = balance.denom === DENOM
            const formattedAmount = isNativeDenom
              ? `${formatAmount(balance.amount, DENOM_DECIMALS)} ${DENOM_DISPLAY}`
              : null

            return (
              <li
                key={`${balance.denom}-${balance.amount}`}
                className={balanceItemClass}
              >
                <div className="flex items-center justify-between">
                  <span className={denomClass}>{balance.denom}</span>
                  <span className={amountClass}>{balance.amount}</span>
                </div>
                {formattedAmount && <span className={approxClass}>≈ {formattedAmount}</span>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default BalancePanel
