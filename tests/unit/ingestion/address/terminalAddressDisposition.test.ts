import { describe, expect, it } from 'vitest'
import {
  isActiveTerminalAddressStatus,
  isArchivedTerminalAddressStatus,
  isCatalogRepairExcludedTerminalAddressStatus,
  isTerminalAddressDisposition,
  readTerminalEnteredAtMs,
} from '@/lib/ingestion/address/terminalAddressDisposition'

describe('terminalAddressDisposition', () => {
  it('classifies active and archived terminal statuses', () => {
    expect(isActiveTerminalAddressStatus('address_terminal_active')).toBe(true)
    expect(isActiveTerminalAddressStatus('address_unavailable_terminal')).toBe(true)
    expect(isArchivedTerminalAddressStatus('address_terminal_archived')).toBe(true)
    expect(isTerminalAddressDisposition('address_terminal_archived')).toBe(true)
    expect(isTerminalAddressDisposition('address_gated')).toBe(false)
  })

  it('excludes terminal disposition from catalog repair queue', () => {
    expect(isCatalogRepairExcludedTerminalAddressStatus('address_terminal_active')).toBe(true)
    expect(isCatalogRepairExcludedTerminalAddressStatus('address_available')).toBe(false)
  })

  it('reads terminalEnteredAt from enrichment failure details', () => {
    const ms = readTerminalEnteredAtMs({
      address_enrichment: {
        terminalEnteredAt: '2026-06-01T12:00:00.000Z',
      },
    })
    expect(ms).toBe(Date.parse('2026-06-01T12:00:00.000Z'))
  })
})
