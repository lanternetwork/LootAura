# YardSaleFinder - Production Launch Roadmap

## Executive Summary

YardSaleFinder is **95% production-ready** with all core features implemented, comprehensive testing, and robust infrastructure. The application has successfully completed Milestones 0-7 including performance optimization, advanced features, monitoring, security, SEO, testing, and cost optimization. The repository is consolidated on `main` branch with proper CI/CD, repo hygiene, and verified scraper and add-sale flows.

**Current Status**: Ready for final deployment preparation and launch.

**Launch Readiness**: 95% complete - only minor configuration and deployment steps remain.

## Prioritized Backlog

### A) MUST-DO BEFORE LAUNCH (Blocking)

#### A1. Environment Configuration & Secrets Management
**Why it matters**: Production requires proper environment variables and secret management for security and functionality.

**Files/areas to touch**:
- `.env.production` (create)
- `lib/env.ts` (verify all required vars)
- Vercel environment variables configuration
- Supabase project settings

**Acceptance criteria**:
- [ ] All required environment variables documented in `env.example`
- [ ] Production environment variables configured in Vercel
- [ ] Supabase project has correct RLS policies
- [ ] Google Maps API key has proper restrictions
- [ ] Health check endpoint returns `{ok: true}` in production

**Effort**: S (2-4 hours)
**Risk**: Low
**Mitigation**: Use environment validation in `lib/env.ts`

**Tests to add/extend**: 
- Environment variable validation tests already exist in `tests/unit/env.test.ts`

#### A2. Database Migration & Setup
**Why it matters**: Production database must be properly configured with all tables, indexes, and RLS policies.

**Files/areas to touch**:
- `supabase/migrations/` (all 3 migration files)
- Supabase dashboard configuration
- Storage bucket setup

**Acceptance criteria**:
- [ ] All 3 migrations run successfully in production
- [ ] `sale-photos` storage bucket exists with public read access
- [ ] RLS policies are active and tested
- [ ] Database indexes are created and optimized
- [ ] Storage check script passes: `npm run check:storage`

**Effort**: M (4-6 hours)
**Risk**: Medium
**Mitigation**: Test migrations in staging environment first

**Tests to add/extend**: 
- Database connection tests already exist in `app/api/health/route.ts`

#### A3. Mapbox Configuration
**Why it matters**: Maps functionality is core to the application and requires proper API configuration.

**Files/areas to touch**:
- Google Cloud Console API configuration
- `next.config.js` (verify image domains)
- `components/YardSaleMap.tsx` (verify dynamic import)

**Acceptance criteria**:
- [ ] Mapbox GL JS configured and maps render in production
- [ ] Mapbox Geocoding API functioning (if used)
- [ ] Public token set in env; secret token only if server geocoding
- [ ] Tiles and markers load correctly

**Effort**: S (2-3 hours)
**Risk**: Low
**Mitigation**: Test with restricted API key in staging

**Tests to add/extend**: 
- Map rendering tests already exist in `tests/integration/map.render.test.tsx`

#### A4. Vercel Deployment Configuration
**Why it matters**: Application must be properly deployed with correct build settings and environment.

**Files/areas to touch**:
- Vercel project settings
- `next.config.js` (verify build settings)
- `package.json` (verify build scripts)

**Acceptance criteria**:
- [ ] Vercel project created and connected to GitHub
- [ ] Production branch set to `main`
- [ ] Build command: `npm run build`
- [ ] Output directory: `.next`
- [ ] Node.js version: 18.x
- [ ] All environment variables configured
- [ ] Custom domain configured (if applicable)

**Effort**: M (3-5 hours)
**Risk**: Low
**Mitigation**: Use Vercel CLI for local testing

**Tests to add/extend**: 
- Build tests already exist in CI workflow

#### A5. Final Production Testing
**Why it matters**: Ensure all functionality works correctly in production environment.

**Files/areas to touch**:
- Production deployment
- Manual testing checklist
- Performance monitoring

**Acceptance criteria**:
- [ ] All E2E tests pass in production
- [ ] Manual smoke test passes (see LAUNCH_CHECKLIST.md)
- [ ] Performance metrics meet targets
- [ ] Error monitoring is active
- [ ] All API endpoints respond correctly

**Effort**: M (4-6 hours)
**Risk**: Medium
**Mitigation**: Use staging environment for testing

**Tests to add/extend**: 
- Comprehensive E2E tests already exist in `tests/e2e/`

### B) SHOULD-DO FOR LAUNCH POLISH

#### B1. Performance Monitoring Setup
**Why it matters**: Monitor application performance and user experience in production.

**Files/areas to touch**:
- Sentry configuration
- Web Vitals monitoring
- Analytics setup

**Acceptance criteria**:
- [ ] Sentry error monitoring active
- [ ] Web Vitals tracking configured
- [ ] Analytics events tracked
- [ ] Performance alerts configured

**Effort**: S (2-3 hours)
**Risk**: Low
**Mitigation**: Use existing Sentry integration

#### B2. SEO & Social Media Optimization
**Why it matters**: Improve discoverability and social sharing.

**Files/areas to touch**:
- `app/sitemap.ts` (verify)
- `lib/metadata.ts` (verify)
- Social media meta tags

**Acceptance criteria**:
- [ ] Sitemap generates correctly
- [ ] Meta tags are properly set
- [ ] Social sharing works
- [ ] Structured data validates

**Effort**: S (2-3 hours)
**Risk**: Low
**Mitigation**: Use existing metadata utilities

#### B3. Security Hardening
**Why it matters**: Ensure production security best practices.

**Files/areas to touch**:
- `middleware.ts` (verify security headers)
- Rate limiting configuration
- CSP policies

**Acceptance criteria**:
- [ ] Security headers are active
- [ ] Rate limiting is configured
- [ ] CSP policies are strict
- [ ] No security vulnerabilities

**Effort**: S (2-3 hours)
**Risk**: Low
**Mitigation**: Use existing security middleware

### C) NICE-TO-HAVE POST-LAUNCH

#### C1. Advanced Analytics
**Why it matters**: Better understanding of user behavior and feature usage.

**Files/areas to touch**:
- Analytics dashboard
- Custom event tracking
- User journey analysis

**Effort**: L (8-12 hours)
**Risk**: Low

#### C2. Advanced PWA Features
**Why it matters**: Enhanced mobile experience and offline capabilities.

**Files/areas to touch**:
- Background sync improvements
- Push notification enhancements
- Offline data synchronization

**Effort**: L (8-12 hours)
**Risk**: Medium

#### C3. Advanced Search & Filtering
**Why it matters**: Better user experience for finding relevant sales.

**Files/areas to touch**:
- Search algorithm improvements
- Advanced filtering options
- Search suggestions

**Effort**: M (6-8 hours)
**Risk**: Low

## Cross-References to Existing Verifications

### Craigslist Scraper Verification ✅
- **Location**: `plan.md` section "Craigslist Scraper — Verification"
- **Coverage**: Parser correctness, API proxy, normalization, import flow
- **Tests**: Unit, integration, E2E tests with HTML fixtures
- **Status**: Complete and verified

### Add-a-Sale Flow Verification ✅
- **Location**: `plan.md` section "Add-a-Sale Flow — Verification"
- **Coverage**: Authentication, form validation, geocoding, database operations, UI rendering
- **Tests**: Unit, integration, E2E, A11y tests
- **Status**: Complete and verified

### Repo Hygiene ✅
- **Location**: `plan.md` section "Repo Hygiene"
- **Coverage**: GitHub templates, CI/CD, security policies, project structure
- **Status**: Complete and verified

### Branch Consolidation ✅
- **Location**: `plan.md` section "Branch Consolidation to `main`"
- **Coverage**: Single canonical branch, proper CI/CD setup
- **Status**: Complete and verified

## Risk Assessment

### High Risk Items
- **None identified** - All critical components are implemented and tested

### Medium Risk Items
- **Database Migration**: Test in staging first
- **Production Testing**: Use comprehensive test suite
- **Environment Configuration**: Validate all variables

### Low Risk Items
- **Vercel Deployment**: Standard Next.js deployment
- **Mapbox Configuration**: Token setup and GL JS integration
- **Performance Monitoring**: Existing integrations

## Success Metrics

### Technical Metrics
- [ ] Build time < 5 minutes
- [ ] Page load time < 3 seconds
- [ ] Error rate < 1%
- [ ] Uptime > 99.5%

### User Experience Metrics
- [ ] Core user flows work end-to-end
- [ ] Mobile experience is smooth
- [ ] Offline functionality works
- [ ] PWA installation works

### Business Metrics
- [ ] Users can create accounts
- [ ] Users can post sales
- [ ] Users can browse and search
- [ ] Users can favorite sales

## Next Steps

1. **Week 1**: Complete all "Must-do" items (A1-A5)
2. **Week 2**: Implement "Should-do" items (B1-B3)
3. **Week 3**: Launch and monitor
4. **Week 4+**: Implement "Nice-to-have" items (C1-C3)

The application is well-positioned for a successful launch with minimal remaining work required.
