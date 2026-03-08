/**
 * Regression: splash is hidden only from (1) APP_READY message handler or
 * (2) fallback path when both hasSeenLoadingFalseRef and hasSeenRouteStateWithBridgeRef are set.
 * Not from onLoadEnd or from navState.loading=false alone (avoids flash before first paint).
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

const MOBILE_INDEX_PATH = path.join(__dirname, '../../mobile/app/index.tsx')

describe('Splash hide invariant (native)', () => {
  it('getHideSplashOnce() is called only in APP_READY path and fallback path (both refs required)', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')

    const appReadyIndex = content.indexOf("message.type === 'APP_READY'")
    expect(appReadyIndex).toBeGreaterThan(-1)

    // At least one call in APP_READY path and one in fallback path (ROUTE_STATE + loading=false)
    const getHideSplashOnceCalls = content.match(/getHideSplashOnce\(\)/g)
    expect(getHideSplashOnceCalls).not.toBeNull()
    expect(getHideSplashOnceCalls!.length).toBeGreaterThanOrEqual(2)

    // First call must be in APP_READY block (after validation, before stopLoader)
    const firstCallIndex = content.indexOf('getHideSplashOnce()')
    expect(firstCallIndex).toBeGreaterThan(appReadyIndex)

    // Fallback path must require both refs (no hide on loading=false or ROUTE_STATE alone)
    expect(content).toContain('hasSeenLoadingFalseRef')
    expect(content).toContain('hasSeenRouteStateWithBridgeRef')
    expect(content).toMatch(/hasSeenRouteStateWithBridgeRef\.current\s*&&\s*!splashHiddenByRef\.current|hasSeenLoadingFalseRef\.current\s*&&\s*!splashHiddenByRef\.current/)

    // Must NOT hide splash solely on onLoadEnd or solely on navState.loading=false
    expect(content).not.toMatch(/Hide splash on earliest safe signal \(onLoadEnd\)/)
    expect(content).not.toMatch(/Hide splash on earliest safe signal \(navState\.loading=false\)/)
  })
})
