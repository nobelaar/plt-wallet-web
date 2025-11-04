import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import type { StargateClient } from '@cosmjs/stargate'

import { BECH32_PREFIX } from '../lib/chain'

import { getStoredAddress, useBalances } from './useBalances'

declare global {
  interface Window {
    localStorage: Storage
  }
}

const createMockClient = () => {
  const client = {
    getAllBalances: vi.fn(),
  }
  return client as unknown as StargateClient & typeof client
}

describe('useBalances', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('validates required address', async () => {
    const { result } = renderHook(() => useBalances(createMockClient()))

    await act(async () => {
      await result.current.fetchBalances('')
    })

    expect(result.current.error).toBe('La dirección es obligatoria.')
    expect(result.current.balances).toEqual([])
  })

  it('validates address prefix', async () => {
    const { result } = renderHook(() => useBalances(createMockClient()))

    await act(async () => {
      await result.current.fetchBalances('cosmos1abc')
    })

    expect(result.current.error).toBe(`La dirección debe comenzar con ${BECH32_PREFIX}1.`)
    expect(result.current.balances).toEqual([])
  })

  it('requires client connection', async () => {
    const { result } = renderHook(() => useBalances(null))

    await act(async () => {
      await result.current.fetchBalances(`${BECH32_PREFIX}1test`)
    })

    expect(result.current.error).toBe('Conectate a un RPC primero.')
    expect(result.current.balances).toEqual([])
  })

  it('fetches and sorts balances', async () => {
    const client = createMockClient()
    vi.mocked(client.getAllBalances).mockResolvedValueOnce([
      { denom: 'uplt', amount: '10' },
      { denom: 'uatom', amount: '5' },
    ])

    const { result } = renderHook(() => useBalances(client))

    await act(async () => {
      await result.current.fetchBalances(`${BECH32_PREFIX}1example`)
    })

    expect(result.current.error).toBeNull()
    expect(result.current.balances).toEqual([
      { denom: 'uatom', amount: '5' },
      { denom: 'uplt', amount: '10' },
    ])
    expect(client.getAllBalances).toHaveBeenCalledWith(`${BECH32_PREFIX}1example`)
    expect(getStoredAddress()).toBe(`${BECH32_PREFIX}1example`)
  })

  it('handles fetch errors gracefully', async () => {
    const client = createMockClient()
    vi.mocked(client.getAllBalances).mockRejectedValueOnce(new Error('RPC down'))

    const { result } = renderHook(() => useBalances(client))

    await act(async () => {
      await result.current.fetchBalances(`${BECH32_PREFIX}1failure`)
    })

    expect(result.current.error).toBe('RPC down')
    expect(result.current.balances).toEqual([])
  })
})

describe('getStoredAddress', () => {
  it('returns empty string on server environments', () => {
    const originalWindow = global.window
    Reflect.deleteProperty(global, 'window')

    expect(getStoredAddress()).toBe('')

    Object.defineProperty(global, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    })
  })
})
