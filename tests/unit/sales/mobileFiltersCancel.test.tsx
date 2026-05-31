import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MobileFiltersModal from '@/components/sales/MobileFiltersModal'
import MobileFilterSheet from '@/components/sales/MobileFilterSheet'

const baseModalProps = {
  isOpen: true,
  dateRange: 'any' as const,
  categories: [] as string[],
  distance: 10,
  onApplyFilters: vi.fn(),
  hasActiveFilters: false,
  onZipLocationFound: vi.fn(),
  onZipError: vi.fn(),
}

const baseSheetProps = {
  isOpen: true,
  dateRange: 'any' as const,
  categories: [] as string[],
  distance: 10,
  onApplyFilters: vi.fn(),
  hasActiveFilters: false,
}

describe('mobile filters Cancel behavior', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    baseModalProps.onApplyFilters.mockClear()
    baseSheetProps.onApplyFilters.mockClear()
  })

  it('MobileFiltersModal does not render Clear All', () => {
    render(<MobileFiltersModal {...baseModalProps} onClose={onClose} />)
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull()
    expect(screen.getByRole('button', { name: /cancel filter changes/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reset filters/i })).toBeTruthy()
  })

  it('MobileFilterSheet does not render Clear All', () => {
    render(<MobileFilterSheet {...baseSheetProps} onClose={onClose} />)
    expect(screen.queryByRole('button', { name: /clear all/i })).toBeNull()
    expect(screen.getByRole('button', { name: /cancel filter changes/i })).toBeTruthy()
  })

  it('MobileFiltersModal Cancel calls onClose only', () => {
    render(<MobileFiltersModal {...baseModalProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Furniture' }))
    fireEvent.click(screen.getByRole('button', { name: /cancel filter changes/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(baseModalProps.onApplyFilters).not.toHaveBeenCalled()
  })

  it('MobileFiltersModal header X matches Cancel (onClose)', () => {
    render(<MobileFiltersModal {...baseModalProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close filters' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(baseModalProps.onApplyFilters).not.toHaveBeenCalled()
  })

  it('MobileFilterSheet Cancel calls onClose only', () => {
    render(<MobileFilterSheet {...baseSheetProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Furniture' }))
    fireEvent.click(screen.getByRole('button', { name: /cancel filter changes/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(baseSheetProps.onApplyFilters).not.toHaveBeenCalled()
  })

  it('MobileFiltersModal Reset Filters does not close or apply', () => {
    render(<MobileFiltersModal {...baseModalProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /reset filters/i }))
    expect(onClose).not.toHaveBeenCalled()
    expect(baseModalProps.onApplyFilters).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Filters' })).toBeTruthy()
  })
})
