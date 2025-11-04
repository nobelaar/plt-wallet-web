import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAIN_ID_STORAGE_KEY, RPC_STORAGE_KEY, usePlt } from './usePlt'

vi.mock('@cosmjs/stargate', () => ({
  StargateClient: {
    connect: vi.fn(),
  },
}))

const { StargateClient } = await import('@cosmjs/stargate')
const connectMock = vi.mocked(StargateClient.connect)

describe('usePlt', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    window.localStorage.clear()
  })

  it('requires an RPC url to connect', async () => {
    const { result } = renderHook(() => usePlt(''))

    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.error).toBe('La URL de RPC es obligatoria.')
    expect(result.current.isConnected).toBe(false)
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('connects and stores chain information on success', async () => {
    const disconnect = vi.fn()
    connectMock.mockResolvedValue({
      getChainId: vi.fn().mockResolvedValue('plt-test0'),
      getHeight: vi.fn().mockResolvedValue(42),
      disconnect,
    })

    const { result } = renderHook(() => usePlt('http://rpc.test'))

    await act(async () => {
      await result.current.connect()
    })

    expect(connectMock).toHaveBeenCalledWith('http://rpc.test')
    expect(result.current.chainId).toBe('plt-test0')
    expect(result.current.height).toBe(42)
    expect(result.current.isConnected).toBe(true)
    expect(window.localStorage.getItem(RPC_STORAGE_KEY)).toBe('http://rpc.test')
    expect(window.localStorage.getItem(CHAIN_ID_STORAGE_KEY)).toBe('plt-test0')

    await act(async () => {
      result.current.disconnect()
    })

    expect(disconnect).toHaveBeenCalled()
    expect(result.current.isConnected).toBe(false)
  })

  it('resets state and reports error when connection fails', async () => {
    const disconnect = vi.fn()
    const failingClient = {
      getChainId: vi.fn().mockResolvedValue('plt-test0'),
      getHeight: vi.fn().mockResolvedValue(42),
      disconnect,
    }
    connectMock.mockResolvedValueOnce(failingClient)
    connectMock.mockRejectedValueOnce(new Error('boom'))

    const { result, rerender } = renderHook(({ url }) => usePlt(url), {
      initialProps: { url: 'http://rpc.test' },
    })

    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.isConnected).toBe(true)

    rerender({ url: 'http://rpc.fail' })

    await act(async () => {
      await result.current.connect()
    })

    expect(result.current.error).toBe('boom')
    expect(result.current.isConnected).toBe(false)
    expect(disconnect).toHaveBeenCalled()
  })
})
