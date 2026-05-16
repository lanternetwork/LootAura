# Icon Files

Canonical LootAura map-pin branding for PWA install surfaces. Source artwork: `public/sitelogo.svg`.

## Active PWA icons

- **icon-192-v2.png** (192×192) — standard install icon (`purpose: any`)
- **icon-512-v2.png** (512×512) — standard install icon (`purpose: any`)
- **icon-maskable-192-v2.png** (192×192) — Android maskable safe zone
- **icon-maskable-512-v2.png** (512×512) — Android maskable safe zone
- **icon.svg** — vector reference (UI / design); not used in web manifest

## App Router (tab / Apple touch)

- **app/favicon.ico** — multi-size (16, 32, 48) tab favicon
- **app/icon.png** — 512×512 metadata icon
- **app/apple-icon.png** — 180×180 Apple touch icon

## Manifest

Served at `/manifest.webmanifest` (static file + route for `application/manifest+json`).

Theme color: `#0b3d2e` (aligned with `app/layout.tsx`).

When replacing icons, bump `BRAND_ICON_VERSION` in `app/layout.tsx` and the service worker cache id in `public/sw.js`.
