// Simple Node script to replace YardSaleFinder/YSF with Loot Aura/lootaura in text files
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const FILES = [
  'STATUS.md',
  'scripts/update-status.ts',
  'pr_description.md',
  'README.md',
  'tests/unit/metadata.test.ts',
  'supabase/migrations/001_initial_schema.sql',
  'public/sw.js',
  'lib/geocode.ts',
  'components/StructuredData.tsx',
  'app/api/push/test/route.ts',
  'docs/CHANGELOG.md',
  'components/PWAInstallPrompt.tsx',
  'ROADMAP.md',
  'LAUNCH_CHECKLIST.md',
  'DEPLOYMENT_PLAN.md',
  'docs/COST_OPTIMIZATION.md',
  'docs/DB_TUNING.md',
  'tests/e2e/happy.spec.ts',
]

function replaceBranding(content: string): string {
  return content
    .replace(/YardSaleFinder/gi, 'Loot Aura')
    .replace(/\bYSF\b/g, 'Loot Aura')
    .replace(/yardsalefinder\.com/gi, 'lootaura.app')
}

for (const rel of FILES) {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) continue
  try {
    const orig = fs.readFileSync(p, 'utf8')
    const next = replaceBranding(orig)
    if (next !== orig) {
      fs.writeFileSync(p, next, 'utf8')
      console.log(`Updated branding in ${rel}`)
    }
  } catch (e) {}
}


