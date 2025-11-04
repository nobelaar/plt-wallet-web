import { describe, expect, it } from 'vitest'

import { formatAmount } from './chain'

describe('formatAmount', () => {
  it('returns 0 for empty input', () => {
    expect(formatAmount('', 6)).toBe('0')
  })

  it('handles positive values with decimals', () => {
    expect(formatAmount('1234567', 6)).toBe('1.234567')
  })

  it('pads fractional part when decimals exceed digits', () => {
    expect(formatAmount('42', 6)).toBe('0.000042')
  })

  it('preserves negative numbers', () => {
    expect(formatAmount('-42', 2)).toBe('-0.42')
  })

  it('returns raw amount when decimals not positive', () => {
    expect(formatAmount('123', 0)).toBe('123')
  })
})
