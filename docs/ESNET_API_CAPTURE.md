# EstateSales.NET API capture (Phase 0 / Phase 2 gate)

Do **not** implement detail enrichment until this document is filled from a live browser session.

## How to capture

1. Open a sale detail URL, e.g. `https://www.estatesales.net/KY/Louisville/40222/4913946`
2. DevTools → Network → filter **Fetch/XHR**
3. Reload; record requests that return sale JSON (likely `saleDetails`, `salePictureDetails`)

## Record here

### `GET /api/saleDetails/{saleId}`

- Full request URL:
- Query params (`include`, `filter`, `bypass`, etc.):
- Required headers:
- Cookies required? (yes/no)
- Sample response status:
- Top-level JSON shape (paste redacted sample or describe keys):

### `GET /api/salePictureDetails`

- Full request URL:
- Query params (`primary-filter`, `ids`, etc.):
- Required headers:
- Sample response shape:

### Rate limiting

- 429 behavior:
- Retry-after header:

### Verdict

- [ ] Unauthenticated server fetch works (curl with browser User-Agent)
- [ ] Requires session cookies
- [ ] Blocked / WAF — headless escalation required

Captured by: _____________  
Date: _____________
