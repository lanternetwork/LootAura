import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const MOBILE_DIR = path.resolve(process.cwd(), 'mobile')
const APP_JSON_PATH = path.join(MOBILE_DIR, 'app.json')

describe('mobile Expo asset references', () => {
  it('includes every app.json asset path on disk', () => {
    const appJson = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf-8')) as {
      expo: {
        icon: string
        splash: { image: string }
        android: { adaptiveIcon: { foregroundImage: string; monochromeImage: string } }
        web: { favicon: string }
        plugins: unknown[]
      }
    }

    const assetPaths = new Set<string>([
      appJson.expo.icon,
      appJson.expo.splash.image,
      appJson.expo.android.adaptiveIcon.foregroundImage,
      appJson.expo.android.adaptiveIcon.monochromeImage,
      appJson.expo.web.favicon,
    ])

    for (const plugin of appJson.expo.plugins) {
      if (Array.isArray(plugin) && plugin[0] === 'expo-splash-screen' && plugin[1]?.image) {
        assetPaths.add(plugin[1].image)
      }
    }

    for (const relativePath of assetPaths) {
      const absolute = path.resolve(MOBILE_DIR, relativePath.replace(/^\.\//, ''))
      expect(fs.existsSync(absolute), `Missing Expo asset: ${relativePath}`).toBe(true)
      expect(fs.statSync(absolute).size).toBeGreaterThan(0)
    }
  })
})
