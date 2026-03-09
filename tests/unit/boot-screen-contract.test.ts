/**
 * Regression: RN boot screen is the sole visual boot layer after native splash.
 * - Native splash is dismissed only after the RN boot screen is ready to cover the app (onLayout).
 * - Boot screen remains visible until readiness (APP_READY or native load+delay or error).
 * - Boot screen fades out once and never reappears (one-shot, launch-scoped).
 * - Previous launch overlay is no longer the active visual boot mechanism.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

const MOBILE_INDEX_PATH = path.join(__dirname, '../../mobile/app/index.tsx')

describe('Boot screen contract (native)', () => {
  it('native splash is dismissed only after RN boot screen onLayout (boot screen covers app first)', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')
    expect(content).toContain('handleBootScreenLayout')
    expect(content).toContain('onLayout={handleBootScreenLayout}')
    const handleBlock = content.slice(content.indexOf('const handleBootScreenLayout'), content.indexOf('const startBootScreenFadeOut'))
    expect(handleBlock).toContain('getHideSplashOnce()')
    expect(handleBlock).toContain('nativeSplashHiddenByBootScreenRef')
  })

  it('boot screen remains visible until readiness (APP_READY or native load+delay or error)', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')
    expect(content).toContain('startBootScreenFadeOut(\'APP_READY\')')
    expect(content).toContain('startBootScreenFadeOut(\'NATIVE_LOAD_DELAY\')')
    expect(content).toContain('startBootScreenFadeOut(\'ERROR\')')
    expect(content).toContain('BOOT_SCREEN_READY_APP_READY')
    expect(content).toContain('BOOT_SCREEN_READY_NATIVE_LOAD_DELAY')
  })

  it('boot screen fades out once and never reappears (one-shot)', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')
    expect(content).toContain('bootScreenFadedRef')
    expect(content).toMatch(/bootScreenFadedRef\.current = true/)
    expect(content).toContain('if (bootScreenFadedRef.current) return')
    expect(content).toContain('setShowBootScreen(false)')
  })

  it('previous launch overlay is no longer the active visual boot mechanism', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')
    expect(content).not.toContain('showLaunchOverlay')
    expect(content).not.toContain('launchOverlayOpacity')
    expect(content).not.toContain('startLaunchOverlayFadeOut')
    expect(content).toContain('showBootScreen')
    expect(content).toContain('bootScreen')
    expect(content).toContain('styles.bootScreen')
  })

  it('boot screen diagnostics are present when diagnostics enabled', () => {
    const content = fs.readFileSync(MOBILE_INDEX_PATH, 'utf-8')
    expect(content).toContain('BOOT_SCREEN_VISIBLE')
    expect(content).toContain('BOOT_SCREEN_NATIVE_SPLASH_HIDDEN')
    expect(content).toContain('BOOT_SCREEN_FADE_START')
    expect(content).toContain('BOOT_SCREEN_HIDDEN')
    expect(content).toContain('BOOT_SCREEN_FAILSAFE')
  })
})
