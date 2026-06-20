import { describe, expect, it } from 'vitest'
import {
  classifyPostgresInsertError,
  extractPostgresConstraintName,
} from '@/lib/ingestion/acquisition/classifyPostgresInsertError'

describe('classifyPostgresInsertError', () => {
  it('maps 23505 to unique_violation', () => {
    const result = classifyPostgresInsertError({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      insertReturnedRow: false,
    })
    expect(result.messageClass).toBe('unique_violation')
    expect(result.code).toBe('23505')
  })

  it('maps 23514 to check_violation', () => {
    const result = classifyPostgresInsertError({
      error: { code: '23514', message: 'new row violates check constraint' },
      insertReturnedRow: false,
    })
    expect(result.messageClass).toBe('check_violation')
  })

  it('maps 23502 to not_null_violation', () => {
    const result = classifyPostgresInsertError({
      error: { code: '23502', message: 'null value in column "city"' },
      insertReturnedRow: false,
    })
    expect(result.messageClass).toBe('not_null_violation')
  })

  it('prefers collision_resolution_failed when collision recovery fails', () => {
    const result = classifyPostgresInsertError({
      error: { code: '23505', message: 'duplicate key value violates unique constraint "ingested_sales_active_sale_instance_key_uniq"' },
      insertReturnedRow: false,
      collisionResolutionAttempted: true,
      collisionResolutionSucceeded: false,
    })
    expect(result.messageClass).toBe('collision_resolution_failed')
  })

  it('extracts constraint name from details', () => {
    expect(
      extractPostgresConstraintName({
        details: 'Key (source_platform, sale_instance_key)=(external_page_source, abc) already exists.',
        message: 'duplicate key value violates unique constraint "ingested_sales_active_sale_instance_key_uniq"',
      })
    ).toBe('ingested_sales_active_sale_instance_key_uniq')
  })
})
