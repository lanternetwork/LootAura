# LootAura

**Last updated: 2025-01-31**

A modern web application for discovering and managing yard sales, garage sales, and estate sales in your area. Built with Next.js, Supabase, and Mapbox.

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/lanternetwork/LootAura.git
   cd LootAura
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   # Edit .env.local with your configuration
   ```
   
   See [docs/env.md](docs/env.md) for all required environment variables.

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** in your browser.

## 📚 Documentation

- **Production Environment**: [docs/PRODUCTION_ENV.md](docs/PRODUCTION_ENV.md) - Complete list of required environment variables
- **Smoke Tests**: [docs/SMOKE_TESTS.md](docs/SMOKE_TESTS.md) - Pre-deployment smoke test checklist
- **Image Management**: [docs/IMAGES.md](docs/IMAGES.md) - Cloudinary image upload and management
- **Testing Guide**: [docs/testing.md](docs/testing.md) - Testing strategies and best practices
- **Operations**: [docs/OPERATIONS.md](docs/OPERATIONS.md) - Rate limiting, monitoring, and operations
- **Contributing**: [CONTRIBUTING.md](CONTRIBUTING.md) - Development guidelines and code standards
- **Security**: [SECURITY.md](SECURITY.md) - Security policy and best practices

## ✨ Features

- **Interactive Map View**: Find sales near you with an interactive Mapbox map
- **Image-First Cards**: Sale cards display with cover images prominently (40% image / 60% info)
- **Smart Clustering**: Map pins cluster when they overlap, touch-only clustering for better UX
- **User Authentication**: Sign up and manage your account with Supabase Auth
- **Favorites**: Save sales you're interested in
- **Category Filtering**: Filter sales by category with multi-select support
- **Date Filtering**: Filter sales by date range (today, weekend, custom)
- **ZIP Code Search**: Find sales near a specific ZIP code
- **Image Upload**: Upload multiple images per sale with Cloudinary
- **Admin Tools**: Comprehensive debugging and development tools
- **Responsive Design**: Works seamlessly on desktop and mobile devices

### Image Management

- **Cloudinary Integration**: Images hosted on Cloudinary CDN for optimized delivery
- **Cover Image Selection**: First uploaded image automatically becomes cover image
- **Placeholder Fallback**: Sales without images display a neutral placeholder
- **Image Validation**: All image URLs validated to ensure Cloudinary URLs only

See [docs/IMAGES.md](docs/IMAGES.md) for complete image hosting documentation.

## 🏗️ Architecture

LootAura uses a **map-centric architecture** where the map viewport is the single source of truth for all sales data.

### Core Principles

- **Map-Centric Design**: Map viewport drives all data fetching and list display
- **Single Fetch Path**: Only 2 entry points to `fetchMapSales` (viewport changes, filter changes)
- **Distance-to-Zoom Mapping**: Distance slider controls map zoom instead of API filtering
- **Touch-Only Clustering**: Pins cluster only when they visually overlap (6.5px radius)
- **Viewport Persistence**: Map viewport state preserved across navigation

### Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Maps**: Mapbox GL JS with react-map-gl
- **Images**: Cloudinary CDN
- **Rate Limiting**: Upstash Redis
- **Monitoring**: Sentry
- **Deployment**: Vercel

## 🔒 Rate Limiting

LootAura implements production-grade rate limiting to protect against abuse:

| Policy | Limit | Window | Scope | Description |
|--------|-------|--------|-------|-------------|
| `AUTH_DEFAULT` | 5 req | 30s | IP | Authentication attempts |
| `AUTH_HOURLY` | 60 req | 1h | IP | Hourly auth limit |
| `GEO_ZIP_SHORT` | 10 req | 60s | IP | ZIP code lookups |
| `SALES_VIEW_30S` | 20 req | 30s | IP | Map viewport fetches |
| `MUTATE_MINUTE` | 3 req | 60s | User | Sale/item creation |

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for complete rate limiting documentation.

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:ui

# Run E2E tests
npm run test:e2e
```

See [docs/testing.md](docs/testing.md) for testing strategies and best practices.

## 📦 Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm test` - Run test suite
- `npm run format` - Format code with Prettier

## 🔧 Development

### Prerequisites

- **Node.js**: 20.18.0 or higher
- **npm**: 10.0.0 or higher
- **Git**: Latest version

### Code Style

- **TypeScript**: Strict mode, no `any` types
- **React**: Functional components with hooks
- **Naming**: camelCase for variables/functions, PascalCase for components
- **Exports**: Prefer named exports over default exports

See [CONTRIBUTING.md](CONTRIBUTING.md) for complete development guidelines.

## 🚢 Deployment

LootAura is designed to deploy to Vercel:

1. **Set environment variables** in Vercel dashboard (see [docs/PRODUCTION_ENV.md](docs/PRODUCTION_ENV.md))
2. **Push to main branch** - Vercel auto-deploys
3. **Run smoke tests** after deployment (see [docs/SMOKE_TESTS.md](docs/SMOKE_TESTS.md))

## 📝 License

See [LICENSE](LICENSE) for license information.

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 🐛 Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md) for reporting guidelines.
