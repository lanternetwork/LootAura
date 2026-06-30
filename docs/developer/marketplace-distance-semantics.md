# Marketplace distance semantics

## Decision

Marketplace distance uses **two explicit reference models**, depending on fetch mode. There is no silent mixing of GPS and viewport semantics on the same surface.

| Fetch mode | Distance reference | User-facing meaning |
|------------|-------------------|---------------------|
| **Bbox / map pan-zoom** (default) | **Viewport center** — midpoint of the request bbox | “How far this sale is from where you are looking on the map” |
| **Near / ZIP** (`near=1` + `lat`/`lng`) | **User anchor** — explicit lat/lng in the request | “How far this sale is from this place (ZIP or chosen point)” |

**Canonical rule for the map-first path:** viewport (fetch bbox + client clip) controls **which sales are eligible**; viewport center is used for **ranking** and **labels** via `distance_m`. Bbox browse does **not** apply a `radiusKm` post-filter.

GPS may center the map or trigger near-mode search; it does **not** redefine bbox-path sort order or list labels after the user pans away.

## Why viewport center (bbox path)

The marketplace is **viewport-first**:

1. Inventory is fetched for an expanded map bbox, not a fixed circle around the device.
2. After pan/zoom, the relevant set is “what is on the map,” not “what is near my phone while I look elsewhere.”
3. Labels align with API `distance_m` so ordering and copy share one reference.

Using user GPS for labels while sorting by viewport center produced contradictions (e.g. a farther sale listed above a closer one). That mismatch is resolved by viewport-center labels via `getMarketplaceDistanceLabel`.

## End-to-end behavior

### Filtering (`radiusKm`)

| Mode | Inventory gate | `distance_m` / sort reference |
|------|----------------|------------------------------|
| **Bbox browse** | Expanded fetch bbox (+ client `visibleSales` clip) | Bbox center — **no** `radiusKm` post-filter |
| **Near / ZIP** (`near=1`) | `lat`/`lng` + `radiusKm` haversine post-filter | Request anchor |

Client may still send `radiusKm` on bbox fetches (UI / metadata); the API ignores it as an exclusion gate during map browsing. Near path unchanged.

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

## Code map

Key modules:

- `lib/sales/parseSalesDistanceKm.ts` — `radiusKm` parsing (bbox + near)
- `lib/map/formatMarketplaceDistanceFromUser.ts` — marketplace labels
- `app/api/sales/route.ts` — reference point + `distance_m` + sort

## Guidance for future changes

When adding marketplace features that mention distance:

1. Identify fetch mode (bbox vs near).
2. Use the matching reference from the table above.
3. Reuse `distance_m` from the API when displaying sorted lists.
4. If product requires “near me” while panned away, that is a **new mode** (explicit UX + API contract), not a silent override of bbox semantics.
