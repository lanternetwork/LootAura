/**
 * Regression: native splash is hidden from (1) APP_READY if it arrives first, or
 * (2) navState.loading === false plus short delay. Not from onLoadEnd. ROUTE_STATE is not required.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

const MOBILE_INDEX_PATH = path.join(__dirname, '../../mobile/app/index.tsx')

describe('Splash hide invariant (native)', () => {
  it('getHideSplashOnce() is called from APP_READY path and from native loading=false+delay path', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')

    expect(content).toContain('getHideSplashOnce()')
    expect(content).toContain('splashHiddenByRef')

    const appReadyIdx = content.indexOf("message.type === 'APP_READY'")
    expect(appReadyIdx).toBeGreaterThan(-1)
    const appReadyBlockEnd = content.indexOf("return; // Handled, don't process further", appReadyIdx)
    const appReadyBlock = content.slice(appReadyIdx, appReadyBlockEnd)
    expect(appReadyBlock).toContain('getHideSplashOnce()')
    expect(appReadyBlock).toContain('splashHiddenByRef')

    expect(content).toContain('SPLASH_POST_LOAD_DELAY_MS')
    expect(content).toContain('splashDelayTimerRef')
    expect(content).toContain('SPLASH_HIDDEN_NATIVE_LOAD_DELAY')
    expect(content).toMatch(/setTimeout\s*\([\s\S]*?getHideSplashOnce\s*\(\)/m)
  })
})
