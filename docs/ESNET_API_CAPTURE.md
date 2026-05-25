# EstateSales.NET API capture (Phase 0 / Phase 2 gate)

Captured: **2026-05-25** (automated server probe + SSR HTML inspection)

## Verdict

- [ ] Unauthenticated server fetch works (curl with browser User-Agent)
- [x] **Use SSR NGRX on detail pages** — `GET /api/saleDetails/{id}` returns **404** from server-side fetch; detail shell embeds `feature.traditionalSaleViewState.entitiesById` in `#estatesales-net-state`
- [ ] Requires session cookies (not tested; REST path unavailable without capture)
- [ ] Blocked / WAF — headless escalation required

**Phase 2 implementation:** `parseEsnetNgrxDetailHtml` + `attemptEsnetDetailEnrichment` (HTTPS HTML fetch, same SSRF-safe stack as list pages). No `esnetApiClient.ts` until a working REST contract is documented below.

## `GET /api/saleDetails/{saleId}`

- Full request URL: `https://www.estatesales.net/api/saleDetails/4913946`
- Query params: _(none observed)_
- Required headers: `User-Agent` (browser-like)
- Cookies required? **unknown** (404 without session from datacenter IP)
- Sample response status: **404**
- Top-level JSON shape: n/a

## `GET /api/salePictureDetails`

- Not probed successfully (depends on saleDetails gate).
- Gallery images are present on detail SSR entity: `entitiesById.{saleId}.pictures[].url` (HTTPS `picturescdn.estatesales.net`).

## Detail SSR JSON shape (authoritative for Phase 2)

Path: `NGRX_STATE.feature.traditionalSaleViewState.entitiesById.{saleId}`

Key fields used by LootAura:

| Field | Use |
|-------|-----|
| `name` | title |
| `htmlDescription` | description (plain text) |
| `locationInfo.address.*` | address lines when present |
| `utcShowAddressAfter` / `locationInfo.utcShowAddressAfter` | address gating |
| `firstUtcStartDate` / `lastUtcEndDate` | sale window |
| `latitude` / `longitude` | native coords |
| `pictures[]` / `mainPicture` | image gallery |

## Rate limiting

- 429 behavior: _(not observed in probe)_
- Retry-after header: _(n/a)_
