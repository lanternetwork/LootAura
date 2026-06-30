# SEO Recovery — Production Verification Checklist

Run **after authorized merge** of PR #515 and Vercel production deploy.

**Do not merge without explicit approval.**

---

## Pre-check

- [ ] Confirm `main` does **not** contain revert-only state (SEO fix commits present)
- [ ] Confirm production deploy completed (Vercel production)

---

## Workstream A — Metro catalog

- [ ] `GET /api/admin/seo/metro-inventory` (admin session) → `metros.length > 0`

---

## Workstream B — Geo pages

Sample 20 slugs from admin metro-inventory response:

- [ ] Each `/yard-sales/[slug]` renders (title contains city name, not generic fallback)
- [ ] Each `/yard-sales-this-weekend/[slug]` renders

---

## Workstream C — Geo links

Sample 100 URLs from `/sitemap/listings-0.xml`:

- [ ] Every **emitted** city/weekend geo link on listing HTML resolves (no generic fallback title)
- [ ] Count listings with no geo links (expected for out-of-catalog metros)

---

## Workstream D — Sitemap index

- [ ] `GET https://lootaura.com/sitemap.xml` → 200
- [ ] Index lists static, listings, cities, weekends segments as applicable
- [ ] `robots.txt` sitemap URL returns 200

---

## Workstream E — Qualified sitemaps

- [ ] `cities.xml` — URLs only for qualified metros (or empty if none qualify)
- [ ] `weekends.xml` — same

---

## Workstream F — Listing regression

- [ ] Sample listing → `index, follow` robots meta
- [ ] `data-seo-sale-detail="crawlable"` present
- [ ] Listing sitemap URL count unchanged (~1000)

---

## Sign-off

| Role | Date | Result |
|------|------|--------|
| | | |
