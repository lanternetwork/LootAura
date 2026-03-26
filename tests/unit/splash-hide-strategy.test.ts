/**
 * Unit tests for splash hide strategy (RN boot screen handoff):
 * (1) APP_READY triggers boot screen fade (startBootScreenFadeOut), not direct splash hide.
 * (2) loading=false plus short delay triggers startBootScreenFadeOut('NATIVE_LOAD_DELAY').
 * (3) ROUTE_STATE is not required for splash hide.
 * (4) Failsafe in _layout only fires if splash never hidden.
 * (5) RN boot screen is present (sole visual layer after native splash until readiness).
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
const LAYOUT_PATH = resolveMobilePath('app/_layout.tsx')

describe('Splash hide strategy', () => {
  it('(1) APP_READY triggers boot screen fade, not direct splash hide', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    const appReadyIdx = index.indexOf("message.type === 'APP_READY'")
    expect(appReadyIdx).toBeGreaterThan(-1)
    const block = index.slice(appReadyIdx, appReadyIdx + 2800)
    expect(block).toMatch(/startBootScreenFadeOut\s*\(\s*['"]APP_READY['"]\s*\)/)
    expect(block).not.toMatch(/getHideSplashOnce\s*\(\)/)
  })

  it('(2) loading=false plus delay triggers startBootScreenFadeOut(NATIVE_LOAD_DELAY)', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).toContain('navState.loading === false')
    expect(index).toContain('SPLASH_POST_LOAD_DELAY_MS')
    expect(index).toContain('splashDelayTimerRef')
    expect(index).toContain('SPLASH_HIDDEN_NATIVE_LOAD_DELAY')
    expect(index).toMatch(/startBootScreenFadeOut\s*\(\s*['"]NATIVE_LOAD_DELAY['"]\s*\)/)
  })

  it('(3) ROUTE_STATE is not required for splash hide', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    const routeStateIdx = index.indexOf("message.type === 'ROUTE_STATE'")
    expect(routeStateIdx).toBeGreaterThan(-1)
    const nextBranch = index.indexOf("} else if (message.type ===", routeStateIdx + 1)
    const routeStateBlock = nextBranch > -1 ? index.slice(routeStateIdx, nextBranch) : index.slice(routeStateIdx, routeStateIdx + 1500)
    expect(routeStateBlock).not.toMatch(/getHideSplashOnce\s*\(\)/)
  })

  it('(4) failsafe only fires if neither path completes', () => {
    const layout = fs.readFileSync(LAYOUT_PATH, 'utf-8')
    expect(layout).toContain('SPLASH_FAILSAFE')
    expect(layout).toContain('!isHidden')
    expect(layout).toContain('hideSplash()')
    expect(layout).toMatch(/8000|10000|FAILSAFE_MS/)
  })

  it('(5) RN boot screen is present as launch layer', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).toContain('showBootScreen')
    expect(index).toContain('handleBootScreenLayout')
    expect(index).toContain('startBootScreenFadeOut')
    expect(index).toContain('styles.bootScreen')
    expect(index).toContain('BOOT_SCREEN_NATIVE_SPLASH_HIDDEN')
  })
})
