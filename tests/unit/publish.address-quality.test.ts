import { describe, expect, it } from 'vitest'
import {
  InsufficientAddressForPublishError,
  validateResolvedAddressForPublish,
} from '@/lib/ingestion/publishValidation'

describe('validateResolvedAddressForPublish', () => {
  it('accepts a normal street address', () => {
    expect(() =>
      validateResolvedAddressForPublish('620 Lincoln Ave, Winnetka, IL 60093', 'Winnetka', 'IL')
    ).not.toThrow()
  })

  it('rejects Unknown address composite', () => {
    expect(() =>
      validateResolvedAddressForPublish('Unknown address, Munster, IN', 'Munster', 'IN')
    ).toThrow(InsufficientAddressForPublishError)
  })

  it('rejects city-state only lines', () => {
    expect(() => validateResolvedAddressForPublish('Munster, IN', 'Munster', 'IN')).toThrow(
      InsufficientAddressForPublishError
    )
  })

  it('rejects null and empty', () => {
    expect(() => validateResolvedAddressForPublish(null, 'Munster', 'IN')).toThrow(
      InsufficientAddressForPublishError
    )
    expect(() => validateResolvedAddressForPublish('   ', 'Munster', 'IN')).toThrow(
      InsufficientAddressForPublishError
    )
  })

  it('rejects prose without street detail', () => {
    expect(() =>
      validateResolvedAddressForPublish('Corner sale near the park', 'Munster', 'IN')
    ).toThrow(InsufficientAddressForPublishError)
  })

  it('accepts PO Box style', () => {
    expect(() =>
      validateResolvedAddressForPublish('PO Box 12, Munster, IN', 'Munster', 'IN')
    ).not.toThrow()
  })
})
