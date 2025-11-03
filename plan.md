## Roadmap

### M4 — Seller Dashboard (Active Next)
- Core seller UX hub for listings, settings, and Cloudinary image management.
- No payment dependencies.
- RLS: sellers read/write only their own listings.
- Unified purple/yellow design scheme.

### M5 — Seller Analytics (Upcoming)
- Add data insights (views, saves, CTR) to seller dashboard.
- Use aggregated Supabase data with strict RLS.
- Visuals via Recharts; purple→yellow gradient.

### M6 — Social Media Integration (Upcoming)
- OG image previews via Cloudinary.
- Share buttons (X, Threads, Facebook, Copy).
- SSR meta tags per sale; event tracking for analytics.

### M7 — Pricing Estimator (Upcoming)
- Suggest prices based on historical data (category + location).
- Inline suggestions with confidence tooltip.

### M8 — iOS & Android Apps (Upcoming)
- Launch PWA-first mobile experience.
- Same Supabase backend; offline cache; install prompt.
- Shared component design with unified color scheme.

---

## Design Standards
- Purple/yellow accents site-wide; neutrals for background/text.
- Maintain WCAG contrast; use consistent elevation (2xl cards, soft shadows).

## Security & RLS Standards
- RLS required for every new table.
- anon: minimal read or none.
- authenticated: `user_id = auth.uid()`.
- No secrets client-side; secrets live only in Vercel.

## CI & Performance Standards
- Lint + type + unit + integration tests must pass.
- Block merges adding console errors or > +5 KB gzip without justification.
- Map interactive ≤ 3 s; p95 visible-sales query ≤ 300 ms.

## Debug Policy
- Temporary logs only under `NEXT_PUBLIC_DEBUG`.
- No PII; remove or disable before merge.


