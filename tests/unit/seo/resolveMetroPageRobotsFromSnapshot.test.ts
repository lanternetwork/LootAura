import { describe, it, expect } from 'vitest'
import { resolveMetroPageRobotsFromSnapshot } from '@/lib/seo/indexRollout'

describe('resolveMetroPageRobotsFromSnapshot', () => {
  it('noindex when national emission gate is closed', () => {
    expect(resolveMetroPageRobotsFromSnapshot(false, true)).toEqual({ index: false, follow: true })
  })

  it('noindex when metro is not qualified and not seeded', () => {
    expect(resolveMetroPageRobotsFromSnapshot(true, false, false)).toEqual({
      index: false,
      follow: true,
    })
  })

  it('index when seeded major even if not qualified', () => {
    expect(resolveMetroPageRobotsFromSnapshot(true, false, true)).toEqual({ index: true, follow: true })
  })

  it('index when gate and metro qualification pass', () => {
    expect(resolveMetroPageRobotsFromSnapshot(true, true)).toEqual({ index: true, follow: true })
  })
})
