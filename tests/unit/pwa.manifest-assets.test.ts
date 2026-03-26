import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const PUBLIC_DIR = path.resolve(process.cwd(), 'public')
const MANIFEST_PATH = path.resolve(PUBLIC_DIR, 'manifest.json')

describe('PWA manifest asset references', () => {
  it('manifest and linked assets resolve in public/', () => {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8')
    const manifest = JSON.parse(raw) as {
      icons?: Array<{ src: string }>
      screenshots?: Array<{ src: string }>
      shortcuts?: Array<{ icons?: Array<{ src: string }> }>
      theme_color?: string
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

  it('theme color stays aligned with layout metadata value', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as { theme_color?: string }
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'app/layout.tsx'), 'utf-8')
    expect(manifest.theme_color).toBe('#0b3d2e')
    expect(layout).toContain('<meta name="theme-color" content="#0b3d2e" />')
  })
})
