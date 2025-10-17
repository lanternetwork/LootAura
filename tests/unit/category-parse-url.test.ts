import { describe, it, expect } from 'vitest'
import { normalizeCategories, buildCategoryParams } from '@/lib/shared/categoryNormalizer'

describe('category parsing and URL building', () => {
  it('normalizes CSV trimming and case', () => {
    expect(normalizeCategories('Tools,  furniture  ')).toEqual(['furniture', 'tools'])
  })

  it('drops empty entries and returns empty array for undefined/empty', () => {
    expect(normalizeCategories('')).toEqual([])
    expect(normalizeCategories(undefined)).toEqual([])
  })

  it('leaves unknown values as slugs (lowercased)', () => {
    expect(normalizeCategories('WeirdCat')).toEqual(['weirdcat'])
  })

  it('omits categories param when selection empty', () => {
    const params = buildCategoryParams([])
    expect(params.get('categories')).toBeNull()
  })

  it('emits canonical categories param when non-empty', () => {
    const params = buildCategoryParams(['tools', 'furniture'])
    expect(params.get('categories')).toBe('tools,furniture')
  })
})


