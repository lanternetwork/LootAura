# LootAura

LootAura helps people discover yard sales, garage sales, and estate sales near them through an interactive map and searchable listings.

Built by [Lanternetwork](https://github.com/lanternetwork).

## Features

- **Interactive map** — Browse sales on a Mapbox-powered map with clustering and viewport-based discovery
- **Listings** — Image-forward sale cards with category, date, and location filters
- **Accounts** — Sign up, save favorites, and manage your profile
- **List a sale** — Create and publish sales with photo uploads
- **Mobile** — Android app (WebView + native shell) with App Links for authentication
- **Responsive** — Works on desktop and mobile browsers

## Technology

- Next.js, React, TypeScript, Tailwind CSS
- Supabase (PostgreSQL, Auth)
- Mapbox, Cloudinary, Vercel

## Local development

Prerequisites: Node.js 20+, npm 10+.

```bash
git clone https://github.com/lanternetwork/LootAura.git
cd LootAura
npm install
cp env.example .env.local
# Configure .env.local — see docs/developer/env.md
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Documentation

| Topic | Location |
|-------|----------|
| Documentation index | [docs/README.md](docs/README.md) |
| Environment variables | [docs/developer/env.md](docs/developer/env.md) |
| Testing | [docs/developer/testing.md](docs/developer/testing.md) |
| Images | [docs/user/images.md](docs/user/images.md) |
| Mobile apps | [docs/user/mobile-apps.md](docs/user/mobile-apps.md) |

## License

Proprietary software. See [LICENSE](LICENSE). All Rights Reserved — Lanternetwork.

Unauthorized copying, modification, distribution, or use is prohibited.

## Security

Report vulnerabilities per [SECURITY.md](SECURITY.md).

## Contributing

This repository is proprietary. External contributions are not accepted. See [CONTRIBUTING.md](CONTRIBUTING.md).
