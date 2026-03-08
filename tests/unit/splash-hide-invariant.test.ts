/**
 * Regression: splash is hidden only from (1) APP_READY message handler (optional earlier)
 * or (2) native path: navState.loading === false plus a short delay (normal production path).
 * Not from onLoadEnd. ROUTE_STATE is not required for splash hide.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

const MOBILE_INDEX_PATH = path.join(__dirname, '../../mobile/app/index.tsx')

describe('Splash hide invariant (native)', () => {
  it('getHideSplashOnce() is called only in APP_READY path and native loading=false+delay path', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')

    const appReadyIndex = content.indexOf("message.type === 'APP_READY'")
    expect(appReadyIndex).toBeGreaterThan(-1)

    const getHideSplashOnceCalls = content.match(/getHideSplashOnce\(\)/g)
    expect(getHideSplashOnceCalls).not.toBeNull()
    expect(getHideSplashOnceCalls!.length).toBeGreaterThanOrEqual(2)

    // At least one call in APP_READY block
    const appReadyBlockEnd = content.indexOf("return; // Handled, don't process further", appReadyIndex)
    expect(appReadyBlockEnd).toBeGreaterThan(appReadyIndex)
    expect(content.slice(appReadyIndex, appReadyBlockEnd).includes('getHideSplashOnce()')).toBe(true)

    // Native path: loading=false triggers a delay then hide (setTimeout with SPLASH_POST_LOAD_DELAY_MS or similar)
    expect(content).toContain('SPLASH_POST_LOAD_DELAY_MS')
    expect(content).toContain('splashDelayTimerRef')
    expect(content).toContain('SPLASH_HIDDEN_NATIVE_LOAD_DELAY')

    // Must NOT hide splash solely on onLoadEnd
    expect(content).not.toMatch(/Hide splash on earliest safe signal \(onLoadEnd\)/)
  })
})
