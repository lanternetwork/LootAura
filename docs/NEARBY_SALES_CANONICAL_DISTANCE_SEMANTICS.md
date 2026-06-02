# Marketplace canonical distance semantics

**Phase 2 · Workstream C · P1**  
**Status:** Adopted  
**Related:** [Nearby Sales Relevance Audit](./NEARBY_SALES_RELEVANCE_REPORT.md) · [Phase 1 PR body](./NEARBY_SALES_RELEVANCE_PR_BODY.md) · [Fetch window investigation](./NEARBY_SALES_FETCH_WINDOW_INVESTIGATION.md)

---

## Decision

LootAura marketplace distance uses **two explicit reference models**, depending on fetch mode. There is no silent mixing of GPS and viewport semantics on the same surface.

| Fetch mode | Distance reference | User-facing meaning |
|------------|-------------------|---------------------|
| **Bbox / map pan-zoom** (default) | **Viewport center** — midpoint of the request bbox | “How far this sale is from where you are looking on the map” |
| **Near / ZIP** (`near=1` + `lat`/`lng`) | **User anchor** — explicit lat/lng in the request | “How far this sale is from this place (ZIP or chosen point)” |

**Canonical rule for the map-first path:** viewport center for **filtering**, **ranking**, and **labels**.

GPS may center the map or trigger near-mode search; it does **not** redefine bbox-path sort order or list labels after the user pans away.

---

## Why viewport center (bbox path)

The marketplace is **viewport-first**:

1. Inventory is fetched for an expanded map bbox, not a fixed circle around the device.
2. After pan/zoom, the relevant set is “what is on the map,” not “what is near my phone while I look elsewhere.”
3. Phase 1 (PR #518) aligned labels with API `distance_m` so ordering and copy share one reference.

Using user GPS for labels while sorting by viewport center produced contradictions (e.g. a farther sale listed above a closer one). That mismatch is resolved by viewport-center labels via `getMarketplaceDistanceLabel`.

---

## End-to-end behavior by subsystem

### Filtering (`radiusKm`)

| Mode | Reference for haversine filter | Code |
|------|------------------------------|------|
| Bbox | Bbox center `(north+south)/2`, `(east+west)/2` | `app/api/sales/route.ts` (bbox parse → `latitude`/`longitude`) |
| Near | Request `lat` / `lng` | Same route, `near=1` branch |

Client sends `radiusKm` on both paths (`SalesClient.fetchMapSales`). Bbox path does **not** send device GPS for distance filtering.

### Ranking

Post-query sort on `GET /api/sales`:

1. `distance_m` ascending (haversine from the reference above)
2. `date_start` ascending
3. `id` lexicographic

Client preserves API order (`visibleSalesDeduplicated`); no client re-sort by GPS.

### Labels

| Surface | Function | Input |
|---------|----------|--------|
| `SaleCard`, `SalesList` | `getMarketplaceDistanceLabel(sale, viewport)` | Prefers `sale.distance_m` from API; fallback haversine from `viewport.center` |
| `MobileSaleCallout` | Same | Same |

Do **not** use `getMarketplaceDistanceFromUserLabel` on marketplace list/card/callout surfaces. That helper is for non-marketplace contexts where true user→sale distance is intended.

### Map centering vs distance

| Concern | Mechanism |
|---------|-----------|
| Initial / “use my location” map position | Geolocation, cookies, `resolveInitialViewport` |
| Which sales appear in bbox mode | Buffered bbox + optional `radiusKm` from **bbox center** |
| Distance copy on cards | Viewport-aligned (`distance_m` / viewport center) |

---

## Code map (source of truth)

```
SalesClient.fetchMapSales
  ├─ bbox: north,south,east,west + radiusKm
  │     └─ GET /api/sales
  │           ├─ latitude/longitude ← bbox center
  │           ├─ distance_m, filter, sort
  │           └─ response
  └─ near=1: lat,lng + radiusKm
        └─ GET /api/sales (user anchor)

SaleCard / MobileSaleCallout
  └─ getMarketplaceDistanceLabel(sale, viewport)
        └─ sale.distance_m (preferred) | haversine(viewport.center, sale)
```

Key modules:

- `lib/sales/parseSalesDistanceKm.ts` — `radiusKm` parsing (bbox + near)
- `lib/map/formatMarketplaceDistanceFromUser.ts` — marketplace labels
- `app/api/sales/route.ts` — reference point + `distance_m` + sort

---

## Phase history

| Phase | Workstream | Outcome |
|-------|------------|---------|
| 1 (#518) | A | Bbox path honors `radiusKm` (no effective 1000 km bypass) |
| 1 (#518) | B | Labels use API `distance_m` / viewport center, not GPS |
| 1 (#518) | C | Fetch-window risk documented (no behavior change) |
| 2 (#519) | A | Empty-buffer lock: do not set `bufferedBounds` on zero-row fetch |
| 2 (#519) | B | Preserve Phase 1 distance filter behavior under lock fix |
| 2 (#519) | C | **This document** — canonical semantics |

---

## Out of scope (unchanged)

- Redesigning ranking beyond `distance_m → date_start → id`
- PostGIS or server-side spatial indexes
- Expanding the 1000-row `fetchWindow` pre-cap ([investigation](./NEARBY_SALES_FETCH_WINDOW_INVESTIGATION.md))
- Category filters, promotions, clustering, SEO

---

## Acceptance checklist (Workstream C)

- [x] Single written model for bbox vs near paths
- [x] Filtering, ranking, and labels documented against the same reference per path
- [x] Marketplace UI uses `getMarketplaceDistanceLabel` only (not GPS label helper)
- [x] Future features can cite this doc instead of re-deriving semantics

---

## Guidance for future changes

When adding marketplace features that mention distance:

1. Identify fetch mode (bbox vs near).
2. Use the matching reference from the table above.
3. Reuse `distance_m` from the API when displaying sorted lists.
4. If product requires “near me” while panned away, that is a **new mode** (explicit UX + API contract), not a silent override of bbox semantics.
