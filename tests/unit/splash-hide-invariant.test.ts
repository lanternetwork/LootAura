/**
 * Regression: splash must be hidden only from the APP_READY message handler,
 * not from onLoadEnd or navState.loading === false, to avoid flash before first paint.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

const MOBILE_INDEX_PATH = path.join(__dirname, '../../mobile/app/index.tsx')

describe('Splash hide invariant (native)', () => {
  it('getHideSplashOnce() is only called in the APP_READY message handler', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')

    // Must contain exactly one call to getHideSplashOnce() (the one in APP_READY path)
    const getHideSplashOnceCalls = content.match(/getHideSplashOnce\(\)/g)
    expect(getHideSplashOnceCalls).not.toBeNull()
    expect(getHideSplashOnceCalls!.length).toBe(1)

    // The single call must appear after the APP_READY handler check
    const appReadyIndex = content.indexOf("message.type === 'APP_READY'")
    expect(appReadyIndex).toBeGreaterThan(-1)
    const getHideSplashOnceIndex = content.indexOf('getHideSplashOnce()')
    expect(getHideSplashOnceIndex).toBeGreaterThan(appReadyIndex)

    // Must NOT hide splash in handleLoadEnd (comment or call removed)
    expect(content).not.toMatch(/Hide splash on earliest safe signal \(onLoadEnd\)/)
    expect(content).not.toMatch(/Hide splash on earliest safe signal \(navState\.loading=false\)/)
  })
})
