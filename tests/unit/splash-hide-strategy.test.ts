/**
 * Unit tests for splash hide strategy (direct handoff):
 * (1) Splash hides on APP_READY if it arrives first.
 * (2) Otherwise splash hides after loading=false plus short delay.
 * (3) ROUTE_STATE is not required for splash hide.
 * (4) Failsafe only fires if neither path completes.
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
  it('(1) splash hides on APP_READY if it arrives first', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    const appReadyIdx = index.indexOf("message.type === 'APP_READY'")
    expect(appReadyIdx).toBeGreaterThan(-1)
    const block = index.slice(appReadyIdx, appReadyIdx + 2800)
    expect(block).toMatch(/splashHiddenByRef\.current\s*=\s*true/)
    expect(block).toMatch(/getHideSplashOnce\(\)/)
    expect(block).toMatch(/!splashHiddenByRef\.current/)
    expect(index).toMatch(/splashDelayTimerRef\.current[\s\S]*?clearTimeout/)
  })

  it('(2) otherwise splash hides after loading=false plus short delay', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).toContain('navState.loading === false')
    expect(index).toContain('SPLASH_POST_LOAD_DELAY_MS')
    expect(index).toContain('splashDelayTimerRef')
    expect(index).toContain('SPLASH_HIDDEN_NATIVE_LOAD_DELAY')
    expect(index).toMatch(/setTimeout\s*\([\s\S]*?!splashHiddenByRef\.current/m)
  })

  it('(3) ROUTE_STATE is not required for splash hide', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
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

  it('(5) no RN boot screen is rendered', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).not.toContain('showBootScreen')
    expect(index).not.toContain('handleBootScreenLayout')
    expect(index).not.toContain('startBootScreenFadeOut')
    expect(index).not.toContain('styles.bootScreen')
  })
})
