/**
 * Regression: native splash is hidden only from RN boot screen onLayout (handleBootScreenLayout).
 * APP_READY and loading=false+delay trigger boot screen fade (startBootScreenFadeOut), not splash hide.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

const MOBILE_INDEX_PATH = path.join(__dirname, '../../mobile/app/index.tsx')

describe('Splash hide invariant (native)', () => {
  it('getHideSplashOnce() is called only from handleBootScreenLayout (boot screen onLayout)', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')

    expect(content).toContain('getHideSplashOnce()')
    expect(content).toContain('handleBootScreenLayout')
    const layoutHandler = content.slice(
      content.indexOf('handleBootScreenLayout'),
      content.indexOf('startBootScreenFadeOut')
    )
    expect(layoutHandler).toContain('getHideSplashOnce()')
    expect(layoutHandler).toContain('nativeSplashHiddenByBootScreenRef')

    const appReadyIdx = content.indexOf("message.type === 'APP_READY'")
    expect(appReadyIdx).toBeGreaterThan(-1)
    const appReadyBlockEnd = content.indexOf("return; // Handled, don't process further", appReadyIdx)
    const appReadyBlock = content.slice(appReadyIdx, appReadyBlockEnd)
    expect(appReadyBlock).not.toContain('getHideSplashOnce()')
    expect(appReadyBlock).toContain('startBootScreenFadeOut(\'APP_READY\')')
  })

  it('loading=false path calls startBootScreenFadeOut(NATIVE_LOAD_DELAY), not getHideSplashOnce', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')
    expect(content).toContain('SPLASH_POST_LOAD_DELAY_MS')
    expect(content).toContain('splashDelayTimerRef')
    expect(content).toContain('SPLASH_HIDDEN_NATIVE_LOAD_DELAY')
    expect(content).toContain("startBootScreenFadeOut('NATIVE_LOAD_DELAY')")
    const loadingFalseBlock = content.slice(
      content.indexOf('navState.loading === false'),
      content.indexOf('navState.loading === false') + 2200
    )
    expect(loadingFalseBlock).not.toMatch(/getHideSplashOnce\s*\(\)/)
  })
})
