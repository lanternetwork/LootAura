# SEO Recovery — Status

**Last updated:** 2026-05-30  
**PR:** [#515](https://github.com/lanternetwork/LootAura/pull/515)  
**Branch:** `fix/seo-recovery`  
**`main`:** SEO fix **not** deployed (reverted at `21c2163e`)

---

## Implementation complete (on branch)

- [x] **Workstream A** — Metro catalog (`T.sales` schema fix + root cause report)
- [x] **Workstream A follow-up** — Catalog footprint aligned with listing sitemap (`applyPublishedSaleCityStateFootprint`)
- [x] **Workstream C** — Geo links gated on catalog membership (no dead emitted links)
- [x] **Workstream D** — Sitemap index (`app/sitemap.xml/route.ts`)
- [x] **Unit tests** — metro discovery, footprint, sitemap index XML, geo linking
- [x] **Integration tests** — sitemap index route, city/weekend metadata, admin metro-inventory route

---

## Verification complete (preview)

See `PREVIEW_VERIFICATION.md`.

| Workstream | Preview status |
|------------|----------------|
| A — Metro catalog | **PASS** |
| B — Geo pages | **PASS** (discovered metros) |
| C — Geo links | **PASS** (emitted links only; catalog-gated) |
| D — Sitemap index | **PASS** |
| E — Qualified sitemaps | **PASS** |
| F — Listing regression | **PASS** |

---

## Pending (requires authorized merge + deploy)

- [ ] **Production verification** on `lootaura.com` — see `PRODUCTION_VERIFICATION.md` checklist
- [ ] **Live admin API** — `GET /api/admin/seo/metro-inventory` with admin session on production

---

## Spec closure

| Category | Status |
|----------|--------|
| Root cause proven | Yes |
| Repair implemented | Yes |
| Tests (unit + integration) | Yes |
| Preview audited | Yes |
| Production audited | **Pending merge** |

**Do not merge without explicit approval.**
