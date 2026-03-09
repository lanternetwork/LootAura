/**
 * Regression: native splash is hidden only when the RN boot screen has painted (boot screen onLayout).
 * APP_READY and native load+delay trigger boot screen fade, not native splash hide.
 * ROUTE_STATE is not required for splash hide.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

const MOBILE_INDEX_PATH = path.join(__dirname, '../../mobile/app/index.tsx')

describe('Splash hide invariant (native)', () => {
  it('getHideSplashOnce() is called only from boot screen onLayout (handleBootScreenLayout)', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')

    expect(content).toContain('getHideSplashOnce()')
    expect(content).toContain('handleBootScreenLayout')
    expect(content).toContain('nativeSplashHiddenByBootScreenRef')

    // Native splash is hidden in boot screen layout only (so first frame after RN paints is boot screen)
    const handleBootScreenLayoutBlock = content.slice(content.indexOf('const handleBootScreenLayout'), content.indexOf('const startBootScreenFadeOut'))
    expect(handleBootScreenLayoutBlock).toContain('getHideSplashOnce()')
    expect(handleBootScreenLayoutBlock).toContain('nativeSplashHiddenByBootScreenRef')

    // Must NOT hide native splash in APP_READY block (only boot screen fade)
    const appReadyBlockStart = content.indexOf("message.type === 'APP_READY'")
    const appReadyBlockEnd = content.indexOf("return; // Handled, don't process further", appReadyBlockStart)
    const appReadyBlock = content.slice(appReadyBlockStart, appReadyBlockEnd)
    expect(appReadyBlock).not.toContain('getHideSplashOnce()')

    // Native path: loading=false triggers delay then startBootScreenFadeOut (not getHideSplashOnce)
    expect(content).toContain('SPLASH_POST_LOAD_DELAY_MS')
    expect(content).toContain('splashDelayTimerRef')
    expect(content).toContain('startBootScreenFadeOut(\'NATIVE_LOAD_DELAY\')')
  })
})
