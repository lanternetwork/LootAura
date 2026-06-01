# Nearby Sales Fetch Window Investigation

**Workstream C · P2 · Investigation only**  
**Date:** 2026-05-28  
**Related:** [NEARBY_SALES_RELEVANCE_REPORT.md](./NEARBY_SALES_RELEVANCE_REPORT.md) · PR #518

No code changes to fetch behavior in Workstreams A/B. This document quantifies risk from the existing **1000-row pre-cap** and records future work.

---

## Summary

| Question | Answer |
|----------|--------|
| Can `max 1000 rows` suppress nearby sales? | **Yes**, when more than 1000 published sales match the DB bbox + filters |
| Is this spatial suppression? | **Indirectly** — pre-sort is `date_start ASC`, not distance |
| Does Workstream A/B fix this? | **No** — distance filter/ranking only apply to rows that survive the cap |
| Current production likelihood | **Low today** — typical bbox queries return far fewer than 1000 rows |
| Future likelihood | **Medium–High** in dense metros as inventory grows |
| Recommended action | **Defer** — document; plan PostGIS / spatial ordering (see Future Work) |

---

## Mechanism (exact code path)

```
GET /api/sales
  → lat/lng bbox filter (expanded viewport: client 1.8× buffer + API +50%)
  → date / category / favorites filters (DB WHERE)
  → .order('date_start', { ascending: true })
  → .range(0, fetchWindow - 1)     ← hard cap here
  → Haversine + radiusKm filter
  → .sort(distance_m → date_start → id)
  → paginate → response
```

**Formula** (`lib/sales/computeSalesFetchWindow.ts`, mirrored from `app/api/sales/route.ts`):

```text
fetchWindow = min(1000, max((offset + limit) × 5, 200))
```

**Marketplace map defaults:**

| Parameter | Value | Source |
|-----------|-------|--------|
| `limit` | 200 | `SalesClient.fetchMapSales` |
| `offset` | 0 | default |
| **fetchWindow** | **1000** | `(0 + 200) × 5` |

Inline comment in route acknowledges the issue:

> *"True fix: server-side spatial ordering (future PostGIS migration)."*  
> — `app/api/sales/route.ts` ~L635–639

---

## Failure mode

When **matching row count > fetchWindow (1000)**:

1. Postgres returns the **1000 sales with earliest `date_start`** in the bbox.
2. Sales with **later** `date_start` never reach Haversine or distance sort.
3. A **geographically closer** sale can be excluded while a **farther** sale is included, if the closer sale has a later start date.

This is **not** random — it is deterministic by `date_start` ordering. It breaks **spatial relevance**, not data integrity.

### Concrete example (hypothetical)

| Sale | Distance from center | date_start | In first 1000 rows? |
|------|----------------------|------------|---------------------|
| A | 0.5 mi | 2026-06-15 | Maybe not (late start) |
| B | 12 mi | 2026-05-30 | Yes (early start) |

User sees B on map/list; A is invisible despite being closer.

---

## When the cap activates

The cap binds when:

```text
count(published sales in expanded DB bbox matching filters) > 1000
```

**Factors that increase count:**

- Wide map zoom / large viewport ( bigger expanded bbox )
- Large distance filter (more area in fetch buffer, though post-filter applies after cap)
- `dateRange=any` (all future sales)
- No category filter

**Factors that decrease count:**

- Category filter (pre-filter via `items_v2`)
- Tight viewport at city/neighborhood zoom
- Low inventory markets

**Factors that do NOT bypass the cap:**

- Workstream A `radiusKm` honor — filters **after** the 1000-row slice
- Workstream B label alignment — display only
- Client `limit=200` — already drives fetchWindow to 1000

---

## Quantified bounds (code-only, no production query)

| Scenario | limit | offset | fetchWindow | Capped? |
|----------|-------|--------|-------------|---------|
| Map fetch (production) | 200 | 0 | 1000 | Yes |
| Default API | 24 | 0 | 200 | No |
| Paginated map | 200 | 200 | 1000 | Yes |
| Max API limit | 200 | 0 | 1000 | Yes |

**Maximum rows ever considered for distance sort on a single request:** 1000.

**Maximum rows returned to client on map fetch:** `min(1000 after filter, 200 paginated)` → up to 200 per response.

---

## Interaction with Workstreams A & B

| Workstream | Effect on fetch-window issue |
|------------|------------------------------|
| **A** — radiusKm on bbox | None on cap; may reduce **visible** rows after sort |
| **B** — label/sort alignment | None; labels match sort among rows that survived cap |
| **C** — this investigation | Risk documented; no runtime change |

---

## Production risk assessment

| Severity | **Medium (latent)** |
|----------|---------------------|
| **User impact today** | Likely minimal — most bbox queries return ≪ 1000 sales |
| **User impact at scale** | Missing nearby pins/list rows in dense markets; “empty patches” near user despite inventory existing |
| **Detectability** | Hard without metro-level count logging; users may report “sale not on map” |
| **Workaround for users** | Pan/zoom, narrow categories, ZIP/near search (separate code path) |

**Evidence gap:** This investigation did not run production `COUNT(*)` by metro. Recommend optional admin/metrics query before prioritizing PostGIS.

---

## Future work (out of scope for PR #518)

1. **PostGIS spatial query** — `ORDER BY geom <-> center` or `ST_DWithin` with distance sort in DB.
2. **Raise or remove 1000 cap** — only safe with spatial ordering; raising cap without it worsens date_start bias.
3. **Observability** — log when `rawCount > fetchWindow` or when bbox match count exceeds 1000 (debug flag).
4. **Validation query** — periodic job: metros where expanded-bbox count > 1000.

---

## Test artifacts

Characterization tests lock the formula (not production counts):

- `tests/unit/sales/computeSalesFetchWindow.test.ts`
- `lib/sales/computeSalesFetchWindow.ts`

---

## Verdict

**Subsystem:** DB pre-window before distance sort — **Partially Working**

- **Working** at current inventory density for typical viewports.
- **Broken under load** when bbox match count exceeds 1000 — closer sales can be silently excluded.

**Action for PR #518:** Document only. No fetch-window or PostGIS changes in this repair.
