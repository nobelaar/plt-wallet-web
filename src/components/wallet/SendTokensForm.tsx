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
    <div className="space-y-6 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-xl shadow-indigo-500/20">
      <h3 className="text-lg font-semibold text-white">Enviar tokens</h3>
      <form onSubmit={prepareSend} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="destination" className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            Dirección destino
          </label>
          <input
            id="destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="plt1..."
            className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="amount" className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Monto ({denom})
            </label>
            <input
              id="amount"
              type="number"
              min="0"
              step="0.000001"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="memo" className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Memo (opcional)
            </label>
            <input
              id="memo"
              value={memo}
              onChange={(event) => setMemo(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              placeholder="Referencia"
            />
          </div>
        </div>

        {error ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
        {resultHash ? (
          <div className="space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
            <p>Transacción enviada. Hash: {resultHash}</p>
            <a href={`${explorerBaseUrl}${resultHash}`} target="_blank" rel="noreferrer" className="text-emerald-100 underline">
              Ver en explorer
            </a>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-gradient-to-r from-[#ff8a8a] via-[#8a8aff] to-[#6affc0] px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-purple-500/30 transition hover:shadow-purple-500/50"
            disabled={isSending}
          >
            Revisar y confirmar
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white"
            onClick={resetState}
          >
            Reiniciar
          </button>
        </div>
      </form>

      {showConfirm ? (
        <div className="space-y-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
          <h4 className="text-base font-semibold text-amber-50">Confirmar envío</h4>
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
              className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-500/30 transition hover:shadow-amber-500/50 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/10 disabled:text-slate-300"
            >
              {isSending ? 'Enviando…' : 'Confirmar y enviar'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConfirm(false)
                setFeeAmount(0)
              }}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-transparent px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:text-white"
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
