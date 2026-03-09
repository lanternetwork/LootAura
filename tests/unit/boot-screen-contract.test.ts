/**
 * RN boot screen contract:
 * - Native splash is hidden only when boot screen onLayout runs (handleBootScreenLayout → getHideSplashOnce).
 * - Boot screen is visible until readiness (APP_READY or NATIVE_LOAD_DELAY or ERROR); then one-shot fade.
 * - No launch overlay hides splash before boot screen is shown; boot screen is the sole post-native-splash layer.
 * - BOOT_SCREEN_* diagnostics are present for testing.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

function resolveMobilePath(relative: string): string {
  const fromDir = path.resolve(__dirname, '../../mobile', relative)
  if (fs.existsSync(fromDir)) return fromDir
  return path.resolve(process.cwd(), 'mobile', relative)
}

const INDEX_PATH = resolveMobilePath('app/index.tsx')

describe('Boot screen contract', () => {
  it('native splash is hidden only from boot screen onLayout (handleBootScreenLayout)', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).toContain('handleBootScreenLayout')
    expect(index).toContain('nativeSplashHiddenByBootScreenRef')
    const handlerStart = index.indexOf('const handleBootScreenLayout')
    const nextCallback = index.indexOf('const startBootScreenFadeOut', handlerStart)
    expect(nextCallback).toBeGreaterThan(handlerStart)
    const handler = index.slice(handlerStart, nextCallback)
    expect(handler).toMatch(/getHideSplashOnce\s*\(\)/)
    expect(handler).toMatch(/BOOT_SCREEN_NATIVE_SPLASH_HIDDEN/)
  })

  it('boot screen is visible until readiness then one-shot fade (startBootScreenFadeOut)', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).toContain('showBootScreen')
    expect(index).toContain('bootScreenFadedRef')
    expect(index).toContain('startBootScreenFadeOut')
    expect(index).toMatch(/startBootScreenFadeOut\s*\(\s*['"]APP_READY['"]\s*\)/)
    expect(index).toMatch(/startBootScreenFadeOut\s*\(\s*['"]NATIVE_LOAD_DELAY['"]\s*\)/)
    expect(index).toMatch(/startBootScreenFadeOut\s*\(\s*['"]ERROR['"]\s*\)/)
    expect(index).toContain('Animated.timing(bootScreenOpacity')
    expect(index).toContain('setShowBootScreen(false)')
  })

  it('boot screen is the sole post–native-splash layer (onLayout hides native splash)', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).toContain('onLayout={handleBootScreenLayout}')
    expect(index).toContain('styles.bootScreen')
    expect(index).toContain('bootScreenImage')
    const appReadyBlock = index.slice(
      index.indexOf("message.type === 'APP_READY'"),
      index.indexOf("return; // Handled, don't process further", index.indexOf("message.type === 'APP_READY'"))
    )
    expect(appReadyBlock).not.toMatch(/getHideSplashOnce\s*\(\)/)
  })

  it('BOOT_SCREEN_* diagnostics are present', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).toContain('BOOT_SCREEN_NATIVE_SPLASH_HIDDEN')
    expect(index).toContain('BOOT_SCREEN_READY_APP_READY')
    expect(index).toContain('BOOT_SCREEN_READY_NATIVE_LOAD_DELAY')
    expect(index).toContain('BOOT_SCREEN_FADE_START')
    expect(index).toContain('BOOT_SCREEN_HIDDEN')
    expect(index).toContain('BOOT_SCREEN_VISIBLE')
    expect(index).toContain('BOOT_SCREEN_FAILSAFE')
  })
})
