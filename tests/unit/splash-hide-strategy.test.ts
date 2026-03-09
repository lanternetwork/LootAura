/**
 * Unit tests for splash hide strategy (RN boot screen):
 * (1) Native splash hides only from boot screen onLayout; APP_READY triggers boot screen fade (not splash hide).
 * (2) loading=false plus short delay triggers boot screen fade (startBootScreenFadeOut); delay timer still used.
 * (3) ROUTE_STATE is not required for splash hide.
 * (4) Failsafe only fires if neither APP_READY nor loading=false+delay path completes.
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
  it('(1) native splash hides only from boot screen onLayout; APP_READY triggers boot screen fade', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    const appReadyIdx = index.indexOf("message.type === 'APP_READY'")
    expect(appReadyIdx).toBeGreaterThan(-1)
    const block = index.slice(appReadyIdx, appReadyIdx + 2800)
    // APP_READY triggers boot screen fade, not native splash hide
    expect(block).toMatch(/startBootScreenFadeOut\s*\(\s*['"]APP_READY['"]\s*\)/)
    // APP_READY cancels pending native delay timer
    expect(index).toMatch(/splashDelayTimerRef\.current[\s\S]*?clearTimeout/)
    // Native splash is hidden only in handleBootScreenLayout (not in APP_READY block)
    const appReadyBlockEnd = index.indexOf("return; // Handled, don't process further", appReadyIdx)
    expect(index.slice(appReadyIdx, appReadyBlockEnd)).not.toMatch(/getHideSplashOnce\s*\(\)/)
  })

  it('(2) loading=false plus short delay triggers boot screen fade', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).toContain('navState.loading === false')
    expect(index).toContain('SPLASH_POST_LOAD_DELAY_MS')
    expect(index).toContain('splashDelayTimerRef')
    expect(index).toContain('SPLASH_HIDDEN_NATIVE_LOAD_DELAY')
    expect(index).toContain("startBootScreenFadeOut('NATIVE_LOAD_DELAY')")
  })

  it('(3) ROUTE_STATE is not required for splash hide', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    // ROUTE_STATE handler must not call getHideSplashOnce (no splash hide in that branch)
    const routeStateIdx = index.indexOf("message.type === 'ROUTE_STATE'")
    expect(routeStateIdx).toBeGreaterThan(-1)
    const nextBranch = index.indexOf("} else if (message.type ===", routeStateIdx + 1)
    const routeStateBlock = nextBranch > -1 ? index.slice(routeStateIdx, nextBranch) : index.slice(routeStateIdx, routeStateIdx + 1500)
    expect(routeStateBlock).not.toMatch(/getHideSplashOnce\s*\(\)/)
  })

  it('(4) failsafe only fires if neither APP_READY nor loading=false path completes', () => {
    const layout = fs.readFileSync(LAYOUT_PATH, 'utf-8')
    expect(layout).toContain('SPLASH_FAILSAFE')
    expect(layout).toContain('!isHidden')
    expect(layout).toContain('hideSplash()')
    expect(layout).toMatch(/8000|10000|FAILSAFE_MS/)
  })
})
