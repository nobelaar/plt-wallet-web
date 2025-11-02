import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { StargateClient } from '@cosmjs/stargate'

import { DENOM, DENOM_DECIMALS, DENOM_DISPLAY, formatAmount } from '../lib/chain'
import { getStoredAddress, useBalances } from '../hooks/useBalances'

interface BalancePanelProps {
  client: StargateClient | null
}

export function BalancePanel({ client }: BalancePanelProps) {
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

  return (
    <section className="rounded-2xl border border-slate-700/60 bg-slate-900/40 p-6 shadow-xl shadow-blue-900/20 backdrop-blur-sm">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-100">Balances</h2>
        <p className="text-sm text-slate-400">{subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="space-y-2">
          <label htmlFor="address" className="text-sm font-medium text-slate-200">
            Dirección
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="plt1..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 shadow-inner focus:border-plt-primary focus:outline-none focus:ring-2 focus:ring-plt-primary/40"
          />
        </div>

        <button
          type="submit"
          disabled={!isClientReady || loading}
          className="inline-flex items-center justify-center rounded-lg border border-slate-500/40 bg-[#0077ff] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-700"
        >
          {loading ? 'Consultando...' : 'Consultar'}
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
      )}

      {!error && !loading && !hasBalances && (
        <p className="mt-4 rounded-lg border border-slate-700/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
          Ingresá una dirección para ver balances disponibles.
        </p>
      )}

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
                className="flex flex-col gap-1 rounded-xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-sm text-slate-200 shadow-inner"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-100">{balance.denom}</span>
                  <span className="tabular-nums text-slate-200">{balance.amount}</span>
                </div>
                {formattedAmount && (
                  <span className="text-xs text-slate-400">≈ {formattedAmount}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default BalancePanel
