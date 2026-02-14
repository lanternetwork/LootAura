import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

function sh(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

function nowIso() {
  return new Date().toISOString()
}

// Git data
const branch = process.env.GITHUB_REF_NAME || sh('git rev-parse --abbrev-ref HEAD')
const commitSha = sh('git rev-parse --short HEAD')
const commitTitle = sh('git log -1 --pretty=%s')
const commitAuthor = sh('git log -1 --pretty=%an')
const commitDate = sh('git log -1 --date=iso --pretty=%ad')

// CI/PR placeholders
const ciStatus = process.env.GITHUB_RUN_ATTEMPT ? 'running' : 'unknown'
const ciLastRun = process.env.GITHUB_RUN_ID ? `run ${process.env.GITHUB_RUN_ID}` : ''
const activePr = process.env.GITHUB_REF && process.env.GITHUB_REF.includes('refs/pull/') ? process.env.GITHUB_REF : ''

const content = `# Loot Aura Repository Status

## 1. Branch & Commit
- **Current branch:** ${branch || 'unknown'}
- **Latest commit:** ${commitSha || 'unknown'} — ${commitTitle || ''} (by ${commitAuthor || 'unknown'} on ${commitDate || 'unknown'})
- **Active PR:** ${activePr || 'n/a'}
- **CI status:** ${ciStatus}${ciLastRun ? `, last run: ${ciLastRun}` : ''}

## 2. Database Schema
- **Schema:** lootaura_v2
- **Tables present:** profiles, sales, items, favorites, reviews, zipcodes (status: unknown)
- **RLS:** status unknown per table
- **Geom & PostGIS:** status unknown (GIST index, trigger)
- **Last applied migrations:** unknown (requires DB connectivity)

## 3. Public Views & RPC (Option A)
- **Views present:** sales_v2, items_v2, favorites_v2, profiles_v2 (status: unknown)
- **RPC functions:** search_sales_within_distance, search_sales_bbox (status: unknown)
- **Grants status:** anon/auth read/write (status: unknown)
- **Schema switching removed:** partial — server client forces public schema

## 4. App Features & APIs
- **/api/sales:** RPC path preferred with fallback (degraded: possible)
- **/api/reviews:** address_key + seller_id linkage (status: planned)
- **/api/health/** routes:** env, db, schema, postgis, auth (status: needs verification)
- **Pagination:** virtualized list; page size varies
- **Mock/Seed data count:** unknown (seed migrations present)
- **Admin Tools:** present; functionality depends on schema application

## 5. Frontend & UX
- **Map behavior:** ✅ full-radius pins via markers API (server cap, no clustering)
- **Responsiveness:** mobile/tablet friendly
- **Accessibility score:** not measured in this run
- **Branding:** Loot Aura in progress; verify no YardSaleFinder remnants

## 6. Deployments
- **Vercel URLs:** Production/Preview (insert)
- **Environment vars:** NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_MAPBOX_TOKEN, etc. (verify set)
- **Last deploy health:** unknown in this run

## 7. Known Issues / TODO
- Apply 032/033 migrations to restore lootaura_v2 schema
- Apply 034 public views/RPC and verify grants
- Wire /api/sales fully to Option A RPC, confirm degraded flag
- Seed minimal data (Louisville, Nashville, Atlanta) and verify counts
- Consider marker clustering for dense maps

## 8. Next Milestone
- Bulk generator + clustering polish

---
Updated on ${nowIso()}
`

writeFileSync('STATUS.md', content)
console.log('STATUS.md updated')


