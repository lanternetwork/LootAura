import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const PUBLIC_DIR = path.resolve(process.cwd(), 'public')
const MANIFEST_PATH = path.resolve(PUBLIC_DIR, 'manifest.webmanifest')
const APP_DIR = path.resolve(process.cwd(), 'app')

const LA_MONOGRAM_PATHS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon-180.png',
]

const CANONICAL_ICON_PATHS = [
  '/icons/icon-192-v2.png',
  '/icons/icon-512-v2.png',
  '/icons/icon-maskable-192-v2.png',
  '/icons/icon-maskable-512-v2.png',
]

describe('PWA manifest asset references', () => {
  it('uses canonical map-pin v2 PNG install icons with maskable purpose', () => {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8')
    const manifest = JSON.parse(raw) as {
      icons?: Array<{ src: string; sizes: string; type: string; purpose?: string }>
    }
    const icons = manifest.icons || []
    expect(
      icons.some(
        (icon) =>
          icon.src === '/icons/icon-192-v2.png' &&
          icon.sizes === '192x192' &&
          icon.type === 'image/png' &&
          icon.purpose === 'any'
      )
    ).toBe(true)
    expect(
      icons.some(
        (icon) =>
          icon.src === '/icons/icon-512-v2.png' &&
          icon.sizes === '512x512' &&
          icon.type === 'image/png' &&
          icon.purpose === 'any'
      )
    ).toBe(true)
    expect(
      icons.some(
        (icon) =>
          icon.src === '/icons/icon-maskable-192-v2.png' &&
          icon.purpose === 'maskable'
      )
    ).toBe(true)
    expect(
      icons.some(
        (icon) =>
          icon.src === '/icons/icon-maskable-512-v2.png' &&
          icon.purpose === 'maskable'
      )
    ).toBe(true)
    for (const la of LA_MONOGRAM_PATHS) {
      expect(icons.some((icon) => icon.src === la)).toBe(false)
    }
  })

  it('manifest and linked assets resolve in public/', () => {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8')
    const manifest = JSON.parse(raw) as {
      icons?: Array<{ src: string }>
      screenshots?: Array<{ src: string }>
      shortcuts?: Array<{ icons?: Array<{ src: string }> }>
    }

    const assetPaths: string[] = []
    for (const icon of manifest.icons || []) assetPaths.push(icon.src)
    for (const screenshot of manifest.screenshots || []) assetPaths.push(screenshot.src)
    for (const shortcut of manifest.shortcuts || []) {
      for (const icon of shortcut.icons || []) assetPaths.push(icon.src)
    }

    for (const src of assetPaths) {
      const relative = src.replace(/^\//, '')
      const absolute = path.resolve(PUBLIC_DIR, relative)
      expect(fs.existsSync(absolute), `Missing manifest asset: ${src}`).toBe(true)
    }
  })

  it('theme color and manifest path stay aligned with layout metadata', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as { theme_color?: string }
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'app/layout.tsx'), 'utf-8')
    expect(manifest.theme_color).toBe('#0b3d2e')
    expect(layout).toContain("themeColor: '#0b3d2e'")
    expect(layout).toContain("manifest: '/manifest.webmanifest'")
    expect(layout).not.toContain('apple-touch-icon-180.png')
    expect(layout).not.toContain('/icons/icon-192.png')
  })

  it('does not reference removed manifest.json', () => {
    expect(fs.existsSync(path.resolve(PUBLIC_DIR, 'manifest.json'))).toBe(false)
    const sw = fs.readFileSync(path.resolve(PUBLIC_DIR, 'sw.js'), 'utf-8')
    expect(sw).not.toContain('manifest.json')
    expect(sw).toContain('lootaura-static-v3')
  })
})

describe('App Router favicon and icon files', () => {
  it('includes multi-layer app/favicon.ico and canonical app icon conventions', () => {
    const faviconPath = path.resolve(APP_DIR, 'favicon.ico')
    expect(fs.existsSync(faviconPath)).toBe(true)
    expect(fs.statSync(faviconPath).size).toBeGreaterThan(0)
    expect(fs.existsSync(path.resolve(APP_DIR, 'icon.png'))).toBe(true)
    expect(fs.existsSync(path.resolve(APP_DIR, 'apple-icon.png'))).toBe(true)
  })

  it('exposes og-default.png for social previews', () => {
    expect(fs.existsSync(path.resolve(PUBLIC_DIR, 'og-default.png'))).toBe(true)
  })

  it('does not retain LA monogram or legacy non-v2 install PNGs in public/icons', () => {
    for (const rel of [
      'icons/icon-192.png',
      'icons/icon-512.png',
      'icons/apple-touch-icon-180.png',
      'icons/apple-touch-icon.png',
    ]) {
      expect(fs.existsSync(path.resolve(PUBLIC_DIR, rel)), `Stale icon should be removed: ${rel}`).toBe(
        false
      )
    }
    for (const rel of CANONICAL_ICON_PATHS.map((p) => p.replace(/^\//, ''))) {
      expect(fs.existsSync(path.resolve(PUBLIC_DIR, rel)), `Missing canonical icon: ${rel}`).toBe(true)
    }
  })
})
