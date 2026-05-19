import { describe, expect, it } from 'vitest'
import {
  classifyDetailFirstInsertFailure,
  insertFailureTelemetryFields,
} from '@/lib/ingestion/acquisition/classifyDetailFirstInsertFailure'

describe('classifyDetailFirstInsertFailure', () => {
  it('classifies postgres 23505 as canonical_collision', () => {
    const result = classifyDetailFirstInsertFailure({
      code: '23505',
      message: 'duplicate key value violates unique constraint "ingested_sales_source_url_key"',
    })
    expect(result).toEqual({
      reason: 'canonical_collision',
      dbCode: '23505',
      dbMessage: expect.stringContaining('duplicate key'),
    })
  })

  it('classifies duplicate message without code as canonical_collision', () => {
    const result = classifyDetailFirstInsertFailure({
      message: 'duplicate key value violates unique constraint',
    })
    expect(result.reason).toBe('canonical_collision')
    expect(result.dbCode).toBeNull()
  })

  it('classifies other errors as insert_failed', () => {
    const result = classifyDetailFirstInsertFailure({
      code: '23514',
      message: 'new row violates check constraint',
    })
    expect(result).toEqual({
      reason: 'insert_failed',
      dbCode: '23514',
      dbMessage: 'new row violates check constraint',
    })
  })

  it('extracts postgres code from message when code field missing', () => {
    const result = classifyDetailFirstInsertFailure({
      message: 'ERROR: 23503 insert or update on table "ingested_sales" violates foreign key',
    })
    expect(result.reason).toBe('insert_failed')
    expect(result.dbCode).toBe('23503')
  })

  it('exposes telemetry fields for observability', () => {
    const classification = classifyDetailFirstInsertFailure({
      code: 'XX000',
      message: 'connection reset',
    })
    expect(insertFailureTelemetryFields(classification)).toEqual({
      insertFailureDbCode: 'XX000',
      insertFailureMessage: 'connection reset',
    })
  })
})
