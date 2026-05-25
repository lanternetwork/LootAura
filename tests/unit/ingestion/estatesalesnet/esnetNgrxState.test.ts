import { describe, expect, it } from 'vitest'
import {
  isoDayFromEsnetNgrxDateTime,
  readEsnetNgrxDateTimeValue,
} from '@/lib/ingestion/estatesalesnet/esnetNgrxState'

describe('esnetNgrxState', () => {
  it('reads DateTime wrapper and ISO day', () => {
    expect(
      readEsnetNgrxDateTimeValue({ _type: 'DateTime', _value: '2026-05-28T13:00:00Z' })
    ).toBe('2026-05-28T13:00:00Z')
    expect(isoDayFromEsnetNgrxDateTime({ _type: 'DateTime', _value: '2026-05-28T13:00:00Z' })).toBe(
      '2026-05-28'
    )
  })
})
