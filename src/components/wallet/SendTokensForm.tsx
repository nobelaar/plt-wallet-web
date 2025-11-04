import { useMemo, useState } from 'react'
import { calculateFee, coins, GasPrice, SigningStargateClient } from '@cosmjs/stargate'

import { generateTotal, isValidAddress } from '../../lib/wallet'

interface SendTokensFormProps {
  client: SigningStargateClient | null
  senderAddress: string | null
  balanceBaseAmount: string
  denom: string
  decimals: number
  gasPrice: GasPrice
  baseDenom: string
  explorerBaseUrl: string
  onRefreshBalance: () => Promise<void>
  onStatusMessage: (message: string) => void
  theme?: 'light' | 'dark'
}

const DEFAULT_GAS_LIMIT = 200000

export function SendTokensForm({
  client,
  senderAddress,
  balanceBaseAmount,
  denom,
  decimals,
  gasPrice,
  baseDenom,
  explorerBaseUrl,
  onRefreshBalance,
  onStatusMessage,
  theme = 'dark',
}: SendTokensFormProps) {
  const [destination, setDestination] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [resultHash, setResultHash] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [feeAmount, setFeeAmount] = useState<number>(0)

  const formattedFee = useMemo(
    () => feeAmount.toLocaleString('es-AR', { maximumFractionDigits: decimals }),
    [feeAmount, decimals],
  )
  const isLight = theme === 'light'
  const containerClass = isLight
    ? 'space-y-6 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-lg shadow-slate-200/60'
    : 'space-y-6 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-indigo-500/20'
  const headingClass = isLight ? 'text-lg font-semibold text-slate-900' : 'text-lg font-semibold text-white'
  const labelClass = isLight ? 'text-xs font-semibold uppercase tracking-wide text-slate-600' : 'text-xs font-semibold uppercase tracking-wide text-slate-300'
  const inputClass = isLight
    ? 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200'
    : 'w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20'
  const gradientButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-xl border border-sky-300 bg-gradient-to-r from-sky-300 via-indigo-300 to-emerald-300 px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm shadow-slate-200/70 transition hover:shadow-slate-300/80 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400'
    : 'inline-flex items-center justify-center rounded-xl border border-white/30 bg-gradient-to-r from-[#ff8a8a] via-[#8a8aff] to-[#6affc0] px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-purple-500/30 transition hover:shadow-purple-500/50'
  const secondaryButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50'
    : 'inline-flex items-center justify-center rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white'
  const errorClass = isLight
    ? 'rounded-xl border border-rose-500/25 bg-rose-50 px-3 py-2 text-sm text-rose-600'
    : 'rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200'
  const resultClass = isLight
    ? 'space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-50 px-3 py-2 text-sm text-emerald-600'
    : 'space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200'
  const confirmBoxClass = isLight
    ? 'space-y-3 rounded-2xl border border-amber-400/30 bg-amber-50 p-4 text-sm text-amber-700'
    : 'space-y-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100'
  const confirmHeadingClass = isLight ? 'text-base font-semibold text-amber-700' : 'text-base font-semibold text-amber-50'
  const confirmPrimaryButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-xl border border-amber-300 bg-amber-400 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-400'
    : 'inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:shadow-amber-500/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-300'
  const confirmSecondaryButtonClass = isLight
    ? 'inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50'
    : 'inline-flex items-center justify-center rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white'

  const available = Number(balanceBaseAmount)

  const resetState = () => {
    setDestination('')
    setAmountInput('')
    setMemo('')
    setShowConfirm(false)
    setFeeAmount(0)
    setError(null)
    setResultHash(null)
  }

  const prepareSend = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setResultHash(null)

    if (!client || !senderAddress) {
      setError('Conectate y desbloqueá una wallet antes de enviar tokens.')
      return
    }

    const trimmedDestination = destination.trim()
    if (!isValidAddress(trimmedDestination)) {
      setError('La dirección destino no tiene un formato válido.')
      return
    }

    const amountNumber = Number(amountInput)
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setError('Ingresá un monto numérico mayor a cero.')
      return
    }

    const amountBase = Math.round(amountNumber * 10 ** decimals)
    const fee = calculateFee(DEFAULT_GAS_LIMIT, gasPrice)
    const feeBase = Number(fee.amount[0]?.amount ?? '0')
    setFeeAmount(feeBase / 10 ** decimals)

    const totalRequired = amountBase + feeBase
    if (totalRequired > available) {
      setError('No hay saldo suficiente para cubrir el monto y las comisiones.')
      return
    }

    setShowConfirm(true)
  }

  const handleSend = async () => {
    if (!client || !senderAddress) return

    setIsSending(true)
    setError(null)

    try {
      const amountNumber = Number(amountInput)
      const amountBase = Math.round(amountNumber * 10 ** decimals)
      const fee = calculateFee(DEFAULT_GAS_LIMIT, gasPrice)

      const result = await client.sendTokens(
        senderAddress,
        destination.trim(),
        coins(amountBase, baseDenom),
        fee,
        memo.trim() || undefined,
      )

      if (result.code !== 0) {
        setError(`No se pudo enviar la transacción. Código de error: ${result.code}. Mensaje: ${result.rawLog}`)
        return
      }

      setResultHash(result.transactionHash)
      setShowConfirm(false)
      setFeeAmount(0)
      setDestination('')
      setAmountInput('')
      setMemo('')
      await onRefreshBalance()
      onStatusMessage('Transacción enviada con éxito.')
    } catch (err) {
      if (typeof err === 'object' && err && 'code' in err) {
        const code = (err as { code: number }).code
        const message = (err as { message?: string }).message ?? 'Error desconocido'
        setError(`No se pudo enviar la transacción. Código de error: ${code}. Mensaje: ${message}`)
      } else if (err instanceof Error) {
        setError(`No se pudo enviar la transacción. Mensaje: ${err.message}`)
      } else {
        setError('No se pudo enviar la transacción. Revisá los datos e intentá nuevamente.')
      }
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={containerClass}>
      <h3 className={headingClass}>Enviar tokens</h3>
      <form onSubmit={prepareSend} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="destination" className={labelClass}>
            Dirección destino
          </label>
          <input
            id="destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="plt1..."
            className={inputClass}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="amount" className={labelClass}>
              Monto ({denom})
            </label>
            <input
              id="amount"
              type="number"
              min="0"
              step="0.000001"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="memo" className={labelClass}>
              Memo (opcional)
            </label>
            <input
              id="memo"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              className={inputClass}
              placeholder="Referencia"
            />
          </div>
        </div>

        {error ? <p className={errorClass}>{error}</p> : null}
        {resultHash ? (
          <div className={resultClass}>
            <p>Transacción enviada. Hash: {resultHash}</p>
            <a
              href={`${explorerBaseUrl}${resultHash}`}
              target="_blank"
              rel="noreferrer"
              className={isLight ? 'text-emerald-600 underline' : 'text-emerald-100 underline'}
            >
              Ver en explorer
            </a>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={gradientButtonClass}
            disabled={isSending}
          >
            Revisar y confirmar
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={resetState}
          >
            Reiniciar
          </button>
        </div>
      </form>

      {showConfirm ? (
        <div className={confirmBoxClass}>
          <h4 className={confirmHeadingClass}>Confirmar envío</h4>
          <p>
            Vas a enviar <strong>{amountInput} {denom}</strong> a <strong>{destination}</strong>.
          </p>
          <p>Fee estimado: {formattedFee} {denom}</p>
          <p>Total aproximado: {generateTotal(Number(amountInput), feeAmount)} {denom}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending}
              className={confirmPrimaryButtonClass}
            >
              {isSending ? 'Enviando…' : 'Confirmar y enviar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConfirm(false)
                setFeeAmount(0)
              }}
              className={confirmSecondaryButtonClass}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default SendTokensForm
