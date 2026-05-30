# Marketplace user location visualization — spec completion

**Branch:** `spec/profile-architecture-phase1-audit`  
**PR:** [#513](https://github.com/lanternetwork/LootAura/pull/513)

## Phases (3/3)

| Phase | Scope | Status |
|-------|--------|--------|
| 1 | Render-only user location marker from `lastUserLocation` | **Complete** |
| 2 | Existing locate controls unchanged (desktop button + mobile FAB) | **Complete** (no code change) |
| 3 | User-relative distance on list cards and map callouts | **Complete** |

## Deliverables

| Artifact | Path |
|----------|------|
| Coordinate validation | `lib/map/isValidUserMapCoordinate.ts` |
| User marker | `components/map/UserLocationMarker.tsx` |
| Distance formatter | `lib/map/formatMarketplaceDistanceFromUser.ts` |
| Map wiring | `components/location/SimpleMap.tsx`, `app/sales/SalesClient.tsx`, `app/sales/MobileSalesShell.tsx` |
| Card / callout wiring | `components/SaleCard.tsx`, `components/SalesList.tsx`, `components/sales/MobileSaleCallout.tsx` |

## Tests

| Layer | Path |
|-------|------|
| Unit | `tests/unit/map/user-location-marker.test.tsx`, `simplemap-user-location-marker.test.tsx`, `formatMarketplaceDistanceFromUser.test.ts`, `sale-card-user-distance.test.tsx` |
| Integration | `tests/integration/marketplace-user-location-visualization.test.tsx` |

## Non-goals (unchanged)

Viewport ownership, fetch lifecycle, clustering, ranking, geolocation acquisition, sale detail / nearby-sales systems.
