/**
 * Unit tests for splash failsafe observability:
 * (a) Failsafe path records SPLASH_FAILSAFE via report callback when diagnostics enabled.
 * (b) No report callback is registered when diagnostics disabled (zero overhead).
 * (c) APP_READY path still records APP_READY in diagnostics as before.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

function resolveMobilePath(relative: string): string {
  const fromDir = path.resolve(__dirname, '../../mobile', relative)
  if (fs.existsSync(fromDir)) return fromDir
  const fromCwd = path.resolve(process.cwd(), 'mobile', relative)
  return fromCwd
}

const LAYOUT_PATH = resolveMobilePath('app/_layout.tsx')
const INDEX_PATH = resolveMobilePath('app/index.tsx')

describe('Splash failsafe diagnostic', () => {
  it('(a) failsafe triggers SPLASH_FAILSAFE diagnostic when report callback is set', () => {
    const layout = fs.readFileSync(LAYOUT_PATH, 'utf-8')

    expect(layout).toContain('setSplashFailsafeReport')
    expect(layout).toContain('splashFailsafeReport')
    // Failsafe block must call the report with SPLASH_FAILSAFE before hideSplash
    expect(layout).toMatch(/SPLASH_FAILSAFE/)
    expect(layout).toMatch(/splashFailsafeReport\s*\(/)
    // Source uses template literal ${FAILSAFE_MS / 1000}s; match literal or pattern
    expect(layout).toMatch(/Splash hidden by .*s failsafe/)
  })

  it('(b) report callback is only registered when diagnostics enabled (no overhead when off)', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')

    // setSplashFailsafeReport must be called only when isDiagnosticsEnabled (useEffect gate)
    expect(index).toContain('setSplashFailsafeReport')
    expect(index).toMatch(/if\s*\(\s*isDiagnosticsEnabled\s*\)\s*\{[\s\S]*?setSplashFailsafeReport/)
    expect(index).toContain('[isDiagnosticsEnabled, pushDiagEvent]')
    // Cleanup clears the callback
    expect(index).toMatch(/setSplashFailsafeReport\(null\)/)
  })

  it('(c) APP_READY path still records APP_READY in diagnostics', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    const appReadyIdx = index.indexOf("message.type === 'APP_READY'")
    expect(appReadyIdx).toBeGreaterThan(-1)
    // Slice must include the full APP_READY block (validation + hideSplash + stopLoader + pushDiagEvent)
    const appReadyBlock = index.slice(appReadyIdx, appReadyIdx + 2500)
    expect(appReadyBlock).toMatch(/pushDiagEvent\s*\(\s*['"]APP_READY['"]/)
  })

  it('(d) splash hide path is recorded in diagnostics (APP_READY or native load+delay or failsafe)', () => {
    const index = fs.readFileSync(INDEX_PATH, 'utf-8')
    expect(index).toContain('SPLASH_HIDDEN_APP_READY')
    expect(index).toContain('SPLASH_HIDDEN_NATIVE_LOAD_DELAY')
  })
})
