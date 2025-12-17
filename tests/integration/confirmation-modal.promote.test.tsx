/**
 * @vitest-environment jsdom
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmationModal from '@/components/sales/ConfirmationModal'

describe('ConfirmationModal promote CTA', () => {
  it('disables Promote now and shows friendly copy when promoteDisabledReason is set', () => {
    const onPromoteNow = vi.fn()

    render(
      <ConfirmationModal
        open={true}
        onClose={() => {}}
        saleId="00000000-0000-0000-0000-000000000000"
        showPromoteCta={true}
        isPromoting={false}
        onPromoteNow={onPromoteNow}
        promoteDisabledReason="Promotions are not available right now. You can promote later from your dashboard."
      />
    )

    const button = screen.getByTestId('confirmation-promote-button')
    expect(button).toBeDisabled()
    expect(
      screen.getByText(
        'Promotions are not available right now. You can promote later from your dashboard.'
      )
    ).toBeInTheDocument()

    fireEvent.click(button)
    expect(onPromoteNow).not.toHaveBeenCalled()
  })

  it('calls onPromoteNow when enabled', () => {
    const onPromoteNow = vi.fn()

    render(
      <ConfirmationModal
        open={true}
        onClose={() => {}}
        saleId="00000000-0000-0000-0000-000000000000"
        showPromoteCta={true}
        isPromoting={false}
        onPromoteNow={onPromoteNow}
        promoteDisabledReason={null}
      />
    )

    const button = screen.getByTestId('confirmation-promote-button')
    expect(button).not.toBeDisabled()

    fireEvent.click(button)
    expect(onPromoteNow).toHaveBeenCalledTimes(1)
  })
})


