import { describe, it, expect } from 'vitest'
import { resolveMetroPageRobotsFromSnapshot } from '@/lib/seo/indexRollout'

describe('resolveMetroPageRobotsFromSnapshot', () => {
  it('noindex when national emission gate is closed', () => {
    expect(resolveMetroPageRobotsFromSnapshot(false, true)).toEqual({ index: false, follow: true })
  })

  it('noindex when metro is not qualified', () => {
    expect(resolveMetroPageRobotsFromSnapshot(true, false)).toEqual({ index: false, follow: true })
  })

  it('index when gate and metro qualification pass', () => {
    expect(resolveMetroPageRobotsFromSnapshot(true, true)).toEqual({ index: true, follow: true })
  })
})
