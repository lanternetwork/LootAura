# Release Checklist

**Last updated: 2025-10-19**

## Pre-Release Checklist

### Code Quality
- [ ] All tests passing (unit, integration, E2E)
- [ ] Console guardrail passing with tightened allowlist
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Bundle size within limits
- [ ] Performance metrics within targets

### Security
- [ ] RLS policies verified and tested
- [ ] No secrets exposed in client code
- [ ] Privilege escalation tests passing
- [ ] PII scrubbing verified in logs

### Documentation
- [ ] Changelog updated with release notes
- [ ] Environment parity matrix current
- [ ] Rollback procedures documented
- [ ] Monitoring thresholds set

### Testing
- [ ] Synthetic E2E tests passing
- [ ] Manual smoke tests completed
- [ ] Accessibility spot checks done
- [ ] Performance baselines recorded

## Release Process

### 1. Pre-Release Validation
```bash
# Run full test suite
npm test

# Check bundle size
npm run build
npm run analyze:bundle

# Verify environment variables
npm run verify:env

# Run synthetic E2E tests
npm run test:synthetic
```

### 2. Staging Deployment
```bash
# Deploy to staging
git checkout main
git push origin main

# Wait for deployment
# Verify staging environment
curl https://staging.lootaura.com/api/health
```

### 3. Production Deployment
```bash
# Deploy to production
git tag v1.2.3
git push origin v1.2.3

# Wait for deployment
# Verify production environment
curl https://lootaura.com/api/health
```

### 4. Post-Release Monitoring
- [ ] Monitor error rates for 30 minutes
- [ ] Check all health endpoints
- [ ] Verify core user flows
- [ ] Watch for performance regressions

## Rollback Procedures

### Immediate Rollback (0-5 minutes)
1. **Disable Feature Flags**: Set problematic flags to `false`
2. **Revert Code**: `git revert <commit-hash>`
3. **Purge CDN**: Clear Vercel/Cloudflare cache
4. **Verify Health**: Check `/api/health` endpoint

### Full Rollback (5-30 minutes)
1. **Revert to Stable Tag**: `git checkout v1.2.2`
2. **Force Deploy**: `git push origin main --force`
3. **Purge All Caches**: CDN, database, Redis
4. **Verify Functionality**: Run smoke tests

## Monitoring & Alerts

### Critical Alerts
- **Share API 5xx**: > 0.5% error rate
- **Auth API 5xx**: > 1% error rate
- **Database 5xx**: > 0.1% error rate
- **Bundle Size**: > 10% increase

### Warning Alerts
- **API Response Time**: > 2s p95
- **Database Query Time**: > 1s p95
- **Memory Usage**: > 80% heap
- **Cache Hit Rate**: < 70%

### Monitoring Sources
- **CI/CD**: GitHub Actions status
- **Application**: Sentry error tracking
- **Performance**: Web Vitals monitoring
- **Infrastructure**: Vercel, Supabase, Mapbox

## Synthetic E2E Tests

### Automated Tests
- **Share Creation**: POST `/api/share` with state
- **Shortlink Resolution**: GET `/api/share?id=<id>`
- **RLS Verification**: Test authentication requirements
- **Health Checks**: Verify all endpoints responding

### Manual Tests
- **Add Sale Flow**: Create → Share → Open shortlink
- **Favorite Toggle**: Authenticate → Toggle → Verify RLS
- **Map Functionality**: Pan, zoom, cluster interactions
- **Search Filters**: Category, date, distance filtering

## Quality Assurance

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader compatibility
- [ ] Focus management
- [ ] ARIA labels present

### Performance
- [ ] LCP < 2.5s
- [ ] FID < 100ms
- [ ] CLS < 0.1
- [ ] Bundle size < 865KB

### Security
- [ ] RLS policies enforced
- [ ] No privilege escalation
- [ ] Secrets properly isolated
- [ ] PII not logged

## Communication Plan

### Internal Notification
- **Slack**: #releases channel
- **Email**: team@lootaura.com
- **Status Page**: Update if > 5 minutes downtime

### External Communication
- **Status Page**: Automated updates
- **Social Media**: If > 15 minutes downtime
- **User Notifications**: In-app banner if > 30 minutes

## Success Criteria

### Technical Success
- [ ] All tests passing
- [ ] No console errors
- [ ] Performance within targets
- [ ] Security verified

### User Success
- [ ] Core functionality working
- [ ] No user reports of issues
- [ ] Performance feels fast
- [ ] Accessibility maintained

### Business Success
- [ ] No revenue impact
- [ ] User engagement maintained
- [ ] Feature adoption as expected
- [ ] No support tickets

## Post-Release Tasks

### Immediate (0-1 hour)
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify core functionality
- [ ] Watch for user reports

### Short-term (1-24 hours)
- [ ] Review monitoring dashboards
- [ ] Check for performance regressions
- [ ] Monitor user feedback
- [ ] Update documentation if needed

### Long-term (1-7 days)
- [ ] Analyze performance trends
- [ ] Review error patterns
- [ ] Gather user feedback
- [ ] Plan next release

## Emergency Contacts

### On-Call Rotation
- **Primary**: DevOps Team
- **Secondary**: Development Team
- **Escalation**: CTO

### External Services
- **Supabase**: Status page + support
- **Vercel**: Status page + support
- **Mapbox**: Support portal
- **Sentry**: Status page + support

---

**Remember**: When in doubt, rollback first and investigate second. User experience is the priority.
