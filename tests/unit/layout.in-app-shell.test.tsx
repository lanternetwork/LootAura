/**
 * Regression: in-app body background (in-app-shell) is gated by isInAppUserAgent;
 * normal web must not get the splash-colored background.
 * Uses source-based assertions so the test is stable across React/Next/env.
 */

import { describe, it, expect } from 'vitest'
import path from 'path'
import fs from 'fs'

function resolveLayoutPath(): string {
  const fromCwd = path.resolve(process.cwd(), 'app/layout.tsx')
  if (fs.existsSync(fromCwd)) return fromCwd
  const fromDir = path.resolve(__dirname, '../../app/layout.tsx')
  if (fs.existsSync(fromDir)) return fromDir
  throw new Error(`layout not found; tried ${fromCwd} and ${fromDir} (cwd=${process.cwd()})`)
}

const LAYOUT_PATH = resolveLayoutPath()

describe('Layout in-app shell (body background gating)', () => {
  it('in-app body class is gated by isInAppUserAgent (user-agent)', () => {
    const layout = fs.readFileSync(LAYOUT_PATH, 'utf-8')
    expect(layout).toContain('isInAppUserAgent')
    expect(layout).toContain('user-agent')
    expect(layout).toContain('in-app-shell')
    expect(layout).toContain('inApp')
  })

  it('default body class is used and inApp ternary exists', () => {
    const layout = fs.readFileSync(LAYOUT_PATH, 'utf-8')
    expect(layout).toContain('min-h-screen bg-neutral-50 text-neutral-900')
    expect(layout).toContain('inApp')
    expect(layout).toContain('bodyClassName')
  })
})
