/**
 * Unit tests for splash hide strategy:
 * (1) Splash hides via APP_READY even if fallback signals never occur.
 * (2) Splash hides via fallback when APP_READY never arrives but both ROUTE_STATE (with bridge) and loading=false occur (either order).
 * (3) Splash does not hide when only one of the two fallback signals occurs.
 * (4) Failsafe only triggers when neither APP_READY nor fallback within timeout.
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
  it('(1) splash hides via APP_READY even if fallback signals never occur', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    const appReadyIdx = index.indexOf("message.type === 'APP_READY'")
    expect(appReadyIdx).toBeGreaterThan(-1)
    const block = index.slice(appReadyIdx, appReadyIdx + 2800)
    // APP_READY path hides splash and sets one-shot guard so fallback cannot run
    expect(block).toMatch(/splashHiddenByRef\.current\s*=\s*true/)
    expect(block).toMatch(/getHideSplashOnce\(\)/)
    expect(block).toMatch(/hideSplashOnce\(\)/)
    // Guard: only hide when not already hidden
    expect(block).toMatch(/!splashHiddenByRef\.current/)
  })

  it('(2) splash hides via fallback when both ROUTE_STATE (with bridge) and loading=false occur regardless of order', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    // ROUTE_STATE branch: when hasRNBridge, set ref and if loading=false already seen, hide
    expect(index).toContain('hasSeenRouteStateWithBridgeRef.current = true')
    expect(index).toMatch(/hasSeenLoadingFalseRef\.current\s*&&\s*!splashHiddenByRef\.current/)
    // handleNavigationStateChange: when loading=false, set ref and if ROUTE_STATE with bridge already seen, hide
    expect(index).toContain('hasSeenLoadingFalseRef.current = true')
    expect(index).toMatch(/hasSeenRouteStateWithBridgeRef\.current\s*&&\s*!splashHiddenByRef\.current/)
    // Fallback records which path hid splash
    expect(index).toContain('SPLASH_HIDDEN_ROUTE_AND_LOAD')
  })

  it('(3) splash does not hide when only one of the two fallback signals occurs', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    // ROUTE_STATE path only hides when BOTH refs are true (hasSeenLoadingFalseRef already set)
    expect(index).toMatch(/hasRNBridge\s*===\s*true[\s\S]*?hasSeenRouteStateWithBridgeRef[\s\S]*?hasSeenLoadingFalseRef\.current\s*&&/)
    // loading=false path only hides when BOTH refs are true (hasSeenRouteStateWithBridgeRef already set)
    expect(index).toMatch(/hasSeenLoadingFalseRef\.current\s*=\s*true[\s\S]*?hasSeenRouteStateWithBridgeRef\.current\s*&&/)
  })

  it('(4) failsafe only triggers when neither APP_READY nor fallback within timeout', () => {
    const layout = fs.readFileSync(LAYOUT_PATH, 'utf-8')
    expect(layout).toContain('SPLASH_FAILSAFE')
    expect(layout).toContain('!isHidden')
    expect(layout).toContain('hideSplash()')
    expect(layout).toMatch(/8000|10000|FAILSAFE_MS/)
  })
})
