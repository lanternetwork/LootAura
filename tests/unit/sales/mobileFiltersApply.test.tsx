import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import MobileFiltersModal from '@/components/sales/MobileFiltersModal'
import MobileFilterSheet from '@/components/sales/MobileFilterSheet'

describe('mobile filters atomic Apply', () => {
  const onApplyFilters = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    onApplyFilters.mockClear()
    onClose.mockClear()
  })

  it('MobileFiltersModal calls onApplyFilters once with full payload', () => {
    render(
      <MobileFiltersModal
        isOpen
        onClose={onClose}
        dateRange="any"
        categories={[]}
        distance={10}
        onApplyFilters={onApplyFilters}
        hasActiveFilters={false}
        onZipLocationFound={vi.fn()}
        onZipError={vi.fn()}
      />
    )

    const content = screen.getByRole('heading', { name: 'Filters' }).closest('div')?.parentElement
    const root = content?.parentElement ?? document.body

    fireEvent.click(screen.getByRole('button', { name: 'Furniture' }))

    const selects = within(root as HTMLElement).getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'saturday' } })
    fireEvent.change(selects[1], { target: { value: '25' } })

    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))

    expect(onApplyFilters).toHaveBeenCalledTimes(1)
    expect(onApplyFilters).toHaveBeenCalledWith({
      dateRange: 'saturday',
      categories: ['Furniture'],
      distance: 25,
    })
  })

  it('MobileFilterSheet calls onApplyFilters once with full payload', () => {
    render(
      <MobileFilterSheet
        isOpen
        onClose={onClose}
        dateRange="any"
        categories={[]}
        distance={10}
        onApplyFilters={onApplyFilters}
        hasActiveFilters={false}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Furniture' }))

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'saturday' } })
    fireEvent.change(selects[1], { target: { value: '25' } })

    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))

    expect(onApplyFilters).toHaveBeenCalledTimes(1)
    expect(onApplyFilters).toHaveBeenCalledWith({
      dateRange: 'saturday',
      categories: ['Furniture'],
      distance: 25,
    })
  })

  it('preserves date and categories when distance is unchanged', () => {
    render(
      <MobileFiltersModal
        isOpen
        onClose={onClose}
        dateRange="any"
        categories={[]}
        distance={10}
        onApplyFilters={onApplyFilters}
        hasActiveFilters={false}
        onZipLocationFound={vi.fn()}
        onZipError={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Furniture' }))
    const dateSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(dateSelect, { target: { value: 'saturday' } })

    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }))

    expect(onApplyFilters).toHaveBeenCalledTimes(1)
    expect(onApplyFilters).toHaveBeenCalledWith({
      dateRange: 'saturday',
      categories: ['Furniture'],
      distance: 10,
    })
  })
})
