# Developer Setup Guide

**Last updated: 2025-01-27 — Map-Centric Architecture**

This guide will help you set up a local development environment for LootAura, our map-centric yard sale discovery platform.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: 20.18.0 or higher
- **npm**: 10.0.0 or higher
- **Git**: Latest version
- **Supabase Account**: For database access
- **Mapbox Account**: For map services

### 1. Clone the Repository

```bash
git clone https://github.com/lanternetwork/LootAura.git
cd LootAura
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

```bash
# Copy environment template
cp env.example .env.local

# Edit with your configuration
nano .env.local
```

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

## 🔧 Environment Configuration

### Required Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE=your-service-role-key
NEXT_PUBLIC_SUPABASE_SCHEMA=lootaura_v2

# Mapbox Configuration
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your-mapbox-token

# Site Configuration
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Optional Environment Variables

```bash
# Debug Mode
NEXT_PUBLIC_DEBUG=true

# VAPID Keys (for push notifications)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# Redis (for rate limiting)
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Nominatim (for geocoding fallback)
NOMINATIM_APP_EMAIL=your-email@example.com

# Seed Token (for admin operations)
SEED_TOKEN=your-seed-token
```

## 🗄️ Database Setup

### Supabase Project Setup

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and anon key

2. **Database Schema**
   - The application uses the `lootaura_v2` schema by default
   - Schema is automatically created on first run
   - See [Environment Configuration](environment-configuration.md) for schema details

3. **Seed Data**
   ```bash
   # Seed mock sales data
   curl -X POST http://localhost:3000/api/admin/seed/mock \
     -H "Authorization: Bearer $SEED_TOKEN"

   # Seed ZIP code data (optional)
   curl -X POST http://localhost:3000/api/admin/seed/zipcodes \
     -H "Authorization: Bearer $SEED_TOKEN"
   ```

### Database Tables

The application uses these main tables:

- **`sales_v2`**: Main sales data
- **`items_v2`**: Sale items
- **`zipcodes`**: US ZIP code data
- **`categories`**: Sale categories

## 🗺️ Mapbox Setup

### 1. Create Mapbox Account

1. Go to [mapbox.com](https://mapbox.com)
2. Create a free account
3. Generate an access token

### 2. Configure Token

Add your Mapbox token to `.env.local`:

```bash
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your-mapbox-token
```

### 3. Map Styles

The application uses Mapbox's default styles:
- **Light**: `mapbox://styles/mapbox/light-v11`
- **Dark**: `mapbox://styles/mapbox/dark-v11`

## 🧪 Testing Setup

### Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:ui

# Run E2E tests
npm run test:e2e

# Run linting
npm run lint

# Type checking
npm run typecheck
```

### Test Configuration

Tests use the same environment variables as development. Make sure your `.env.local` is properly configured.

### Test Database

- Tests use the same Supabase project
- Mock data is seeded automatically
- Tests clean up after themselves

## 🔍 Debug Mode

### Enable Debug Mode

```bash
# Add to .env.local
NEXT_PUBLIC_DEBUG=true
```

### Debug Features

- **Console Logging**: Comprehensive logging
- **Admin Tools**: Access at `/admin/tools`
- **Diagnostic Overlay**: Real-time fetch monitoring
- **Performance Metrics**: Detailed timing information

### Debug Tools

1. **Admin Interface**: `http://localhost:3000/admin/tools`
2. **Console Logs**: Check browser console for detailed logs
3. **Network Tab**: Monitor API calls and responses

## 📱 Mobile Development

### Responsive Design

The application is mobile-first and responsive:

- **Breakpoints**: Tailwind CSS breakpoints
- **Mobile Drawer**: Sales list slides up on mobile
- **Touch Support**: Full touch interaction support

### Mobile Testing

```bash
# Test on mobile device
npm run dev
# Access via your local IP address
```

## 🚀 Deployment

### Vercel Deployment

1. **Connect Repository**
   - Connect your GitHub repository to Vercel
   - Configure environment variables
   - Deploy automatically on push

2. **Environment Variables**
   - Copy all variables from `.env.local`
   - Set `NEXT_PUBLIC_SITE_URL` to your domain
   - Configure production Supabase project

3. **Domain Configuration**
   - Set up custom domain
   - Configure SSL certificates
   - Set up redirects if needed

### Production Checklist

- [ ] Environment variables configured
- [ ] Supabase project set up
- [ ] Mapbox token configured
- [ ] Domain configured
- [ ] SSL certificates active
- [ ] Performance monitoring enabled

## 🛠️ Development Tools

### VS Code Extensions

Recommended extensions for development:

- **ES7+ React/Redux/React-Native snippets**
- **TypeScript Importer**
- **Tailwind CSS IntelliSense**
- **Prettier - Code formatter**
- **ESLint**

### VS Code Settings

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

### Git Hooks

The project uses pre-commit hooks for:

- **Linting**: ESLint checks
- **Formatting**: Prettier formatting
- **Type Checking**: TypeScript validation

## 🔧 Troubleshooting

### Common Issues

#### 1. Environment Variables Not Loading

```bash
# Check if .env.local exists
ls -la .env.local

# Restart development server
npm run dev
```

#### 2. Supabase Connection Issues

```bash
# Check Supabase URL format
echo $NEXT_PUBLIC_SUPABASE_URL

# Verify anon key
echo $NEXT_PUBLIC_SUPABASE_ANON_KEY
```

#### 3. Mapbox Not Loading

```bash
# Check Mapbox token format
echo $NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

# Verify token starts with 'pk.'
```

#### 4. Database Schema Issues

```bash
# Check schema configuration
echo $NEXT_PUBLIC_SUPABASE_SCHEMA

# Verify schema exists in Supabase
```

### Debug Steps

1. **Check Console**: Look for error messages
2. **Network Tab**: Check API call failures
3. **Environment**: Verify all variables are set
4. **Database**: Check Supabase project status
5. **Mapbox**: Verify token validity

### Getting Help

- **GitHub Issues**: [Create an issue](https://github.com/lanternetwork/LootAura/issues)
- **Documentation**: Check [docs/](docs/) folder
- **Debug Guide**: See [docs/debug-guide.md](debug-guide.md)

## 📚 Additional Resources

### Documentation

- [Architecture Overview](architecture.md)
- [API Documentation](api.md)
- [Testing Guide](testing.md)
- [Debug Guide](debug-guide.md)

### External Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Mapbox Documentation](https://docs.mapbox.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

## 🎯 Next Steps

After setting up your development environment:

1. **Explore the Codebase**: Start with `app/sales/SalesClient.tsx`
2. **Run Tests**: Ensure all tests pass
3. **Check Debug Mode**: Enable debug mode and explore
4. **Read Architecture**: Understand the map-centric design
5. **Contribute**: See [CONTRIBUTING.md](../CONTRIBUTING.md)

Happy coding! 🚀
