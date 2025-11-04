import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

import { BalancePanel } from './BalancePanel'

describe('BalancePanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('disables form when client is missing', async () => {
    render(<BalancePanel client={null} />)

    const button = screen.getByRole('button', { name: /consultar/i })
    expect(button).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/Dirección/i), 'plt1xyz')
    expect(button).toBeDisabled()
  })

  it('shows error for invalid address', async () => {
    const mockClient = { getAllBalances: vi.fn() }
    render(<BalancePanel client={mockClient as never} />)

    await userEvent.type(screen.getByLabelText(/Dirección/i), 'cosmos1bad')
    await userEvent.click(screen.getByRole('button', { name: /consultar/i }))

    expect(await screen.findByText(/debe comenzar/)).toBeInTheDocument()
    expect(mockClient.getAllBalances).not.toHaveBeenCalled()
  })

  it('renders balances returned by the client', async () => {
    const mockClient = {
      getAllBalances: vi.fn().mockResolvedValue([
        { denom: 'uatom', amount: '5' },
        { denom: 'uplt', amount: '10' },
      ]),
    }

    render(<BalancePanel client={mockClient as never} />)

    await userEvent.clear(screen.getByLabelText(/Dirección/i))
    await userEvent.type(screen.getByLabelText(/Dirección/i), 'plt1address')
    await userEvent.click(screen.getByRole('button', { name: /consultar/i }))

    await waitFor(() => {
      expect(mockClient.getAllBalances).toHaveBeenCalledWith('plt1address')
    })

    expect(await screen.findByText('uatom')).toBeInTheDocument()
    expect(await screen.findByText('uplt')).toBeInTheDocument()
  })
})
