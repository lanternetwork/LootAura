# CI/CD Setup Guide

This document outlines the CI/CD configuration and requirements for the LootAura project.

## Node.js Version Requirements

- **Required**: Node.js 20.18.0 or higher
- **Package Manager**: npm 10.0.0 or higher
- **Lock File**: package-lock.json (included in repository)

## Environment Variables

The following environment variables are required for CI/CD:

### Required Variables
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

### Optional Variables
```bash
NEXT_PUBLIC_SUPABASE_SCHEMA=lootaura_v2  # Defaults to 'public'
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-upload-preset
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your-mapbox-token
```

### GitHub Secrets
Set these in your GitHub repository settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_SCHEMA`
- `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`
- `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`
- `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- `NEXT_PUBLIC_SITE_URL`
- `VERCEL_TOKEN` (for deployment)
- `VERCEL_ORG_ID` (for deployment)
- `VERCEL_PROJECT_ID` (for deployment)

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) includes:

1. **Test Job**: Runs on Node.js 20.x
   - Type checking (`npm run typecheck`)
   - Linting (`npm run lint`)
   - Unit tests (`npm run test`)
   - Build verification (`npm run build`)

2. **E2E Job**: Runs Playwright tests
   - Installs Playwright browsers
   - Runs end-to-end tests

3. **Deploy Job**: Deploys to Vercel (main branch only)
   - Builds production bundle
   - Deploys to Vercel

## Local Development Setup

1. **Install Node.js 20.18.0+**:
   ```bash
   nvm install 20.18.0
   nvm use 20.18.0
   ```

2. **Install dependencies**:
   ```bash
   npm ci
   ```

3. **Set up environment variables**:
   ```bash
   cp env.example .env.local
   # Edit .env.local with your values
   ```

4. **Run development server**:
   ```bash
   npm run dev
   ```

## Troubleshooting

### Node.js Version Issues
- Ensure you're using Node.js 20.18.0 or higher
- Check with `node --version`
- Use `nvm use` to switch to the correct version

### Lock File Issues
- The repository includes `package-lock.json`
- Use `npm ci` instead of `npm install` in CI/CD
- Never commit `node_modules/` directory

### Build Failures
- Check all environment variables are set
- Ensure all dependencies are properly installed
- Verify TypeScript compilation passes
- Check ESLint rules are satisfied

## Branch Protection

Recommended branch protection rules:

- Require status checks to pass before merging
- Require branches to be up to date before merging
- Require linear history
- Restrict pushes to main branch
- Require pull request reviews

## Deployment

The project is configured for deployment to Vercel:

1. **Automatic**: Pushes to `main` branch trigger deployment
2. **Manual**: Can be triggered from Vercel dashboard
3. **Preview**: Pull requests get preview deployments

### Vercel Configuration

- **Framework**: Next.js
- **Node.js Version**: 20.x
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm ci`
