# Owner's Runbook

**Last updated: 2025-10-19**

## Emergency Response Procedures

### 🚨 API Error Spikes

#### Symptoms
- Error rate > 1% for 5+ minutes
- 5xx errors in logs
- User reports of failures
- Monitoring alerts triggered

#### Immediate Actions (0-5 minutes)
1. **Check External Services**: Supabase, Mapbox, Redis status pages
2. **Review Recent Changes**: Check last deployment, feature flags
3. **Disable Problematic Features**: Set feature flags to `false`
4. **Check Logs**: Review error patterns in Sentry/Vercel logs

#### Response Steps
```bash
# 1. Check service status
curl https://lootaura.com/api/health

# 2. Disable feature flags if needed
NEXT_PUBLIC_FLAG_SHARE_LINKS=false
NEXT_PUBLIC_FLAG_OFFLINE_CACHE=false

# 3. Check error logs
# Vercel dashboard → Functions → Logs
# Sentry dashboard → Issues

# 4. If external service issue
# Check Supabase status page
# Check Mapbox status page
# Check Redis status page
```

#### Escalation (5-15 minutes)
- **If Supabase down**: Check Supabase status, contact support
- **If Mapbox down**: Check Mapbox status, contact support
- **If Redis down**: Check Upstash status, contact support
- **If code issue**: Revert to last stable deployment

### 🔗 Share Failures

#### Symptoms
- Share API returning 5xx errors
- Shortlinks not resolving
- User reports of broken links
- Share button not working

#### Immediate Actions (0-5 minutes)
1. **Disable Share Feature**: Set `NEXT_PUBLIC_FLAG_SHARE_LINKS=false`
2. **Check Database**: Verify `shared_states` table accessible
3. **Check API Logs**: Review share API error patterns
4. **Test Manually**: Try creating and resolving a share link

#### Response Steps
```bash
# 1. Disable share feature
NEXT_PUBLIC_FLAG_SHARE_LINKS=false

# 2. Check database connection
# Supabase dashboard → Table Editor → shared_states

# 3. Test share API manually
curl -X POST https://lootaura.com/api/share \
  -H "Content-Type: application/json" \
  -d '{"state":{"view":{"lat":38.2527,"lng":-85.7585,"zoom":10},"filters":{"dateRange":"any","categories":[],"radius":25}}}'

# 4. Check for database issues
# Supabase dashboard → Logs → Database
```

#### Escalation (5-15 minutes)
- **If database issue**: Check Supabase status, contact support
- **If API issue**: Review code changes, revert if needed
- **If rate limiting**: Check Redis connection, adjust limits
- **If persistent**: Revert to last stable deployment

### 🔒 RLS 42501 Spikes

#### Symptoms
- 42501 errors in logs
- Users unable to access data
- Authentication issues
- Permission denied errors

#### Immediate Actions (0-5 minutes)
1. **Check RLS Policies**: Verify policies are intact
2. **Check Authentication**: Verify auth system working
3. **Check User Sessions**: Verify session management
4. **Review Recent Changes**: Check for RLS policy changes

#### Response Steps
```bash
# 1. Check RLS policies
# Supabase dashboard → Authentication → Policies

# 2. Check authentication
curl https://lootaura.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}'

# 3. Check user sessions
# Supabase dashboard → Authentication → Users

# 4. Review RLS drift guard report
# GitHub Actions → RLS Drift Guard → Artifacts
```

#### Escalation (5-15 minutes)
- **If RLS policies changed**: Revert policy changes
- **If auth system down**: Check Supabase auth status
- **If session issues**: Check cookie settings, middleware
- **If persistent**: Revert to last stable deployment

### 🚫 Console Guardrail Failures

#### Symptoms
- Tests failing on console output
- Unexpected console.error/warn messages
- Test suite not passing
- CI/CD pipeline failing

#### Immediate Actions (0-5 minutes)
1. **Check Test Logs**: Review failing test output
2. **Identify Source**: Find which test is generating console output
3. **Check Allowlist**: Verify if pattern should be allowed
4. **Fix Source**: Remove or fix console output

#### Response Steps
```bash
# 1. Check failing tests
npm test -- --reporter=verbose

# 2. Check console guardrail
# tests/setup.ts → ALLOWED_PATTERNS

# 3. Add temporary allowance if needed
# Add pattern to ALLOWED_PATTERNS with expiry comment

# 4. Fix source of console output
# Remove or fix console.error/warn calls
```

#### Escalation (5-15 minutes)
- **If test issue**: Fix test to not generate console output
- **If source issue**: Fix source code to not log errors
- **If allowlist issue**: Update allowlist with proper documentation
- **If persistent**: Disable guardrail temporarily (not recommended)

## Communication Procedures

### Internal Notification
- **Slack**: #alerts channel for immediate notification
- **Email**: ops@lootaura.com for detailed reports
- **Status Page**: Update if > 5 minutes downtime
- **Dashboard**: Update monitoring dashboard

### External Communication
- **Status Page**: Automated updates for service status
- **Social Media**: If > 15 minutes downtime
- **User Notifications**: In-app banner if > 30 minutes
- **Support**: Update support team on issues

### Escalation Contacts
- **Primary**: DevOps Team (on-call rotation)
- **Secondary**: Development Team
- **Escalation**: CTO
- **External**: Supabase, Vercel, Mapbox support

## Monitoring & Alerts

### Critical Alerts (Immediate Response)
- **API 5xx**: > 1% error rate for 5 minutes
- **Database 5xx**: > 0.1% error rate for 5 minutes
- **Auth 5xx**: > 2% error rate for 5 minutes
- **Share 5xx**: > 5% error rate for 5 minutes

### Warning Alerts (Investigation Required)
- **API Response Time**: > 2s p95 for 15 minutes
- **Database Query Time**: > 1s p95 for 15 minutes
- **Memory Usage**: > 80% heap utilization
- **Cache Hit Rate**: < 70% for 30 minutes

### Monitoring Sources
- **Sentry**: Real-time error tracking and alerting
- **Vercel**: Deployment status and function logs
- **Supabase**: Database performance and RLS policies
- **GitHub Actions**: CI/CD pipeline status

## Recovery Procedures

### If Rollback Fails
1. **Emergency Mode**: Disable all feature flags
2. **Static Fallback**: Serve cached version if available
3. **Database**: Check Supabase status page
4. **External Services**: Verify Mapbox, Sentry, Redis

### If Database Issues
1. **Check Supabase**: Status page and logs
2. **RLS Policies**: Verify no policy changes
3. **Migration Status**: Check migration history
4. **Connection Pool**: Restart if needed

### If External Service Issues
1. **Mapbox**: Check token validity and usage
2. **Sentry**: Verify DSN configuration
3. **Redis**: Check Upstash status
4. **CDN**: Verify cache configuration

## Prevention Measures

### Pre-Deployment
- [ ] Run full test suite
- [ ] Smoke test in staging
- [ ] Check environment parity
- [ ] Verify rollback plan
- [ ] Check external service status

### Post-Deployment
- [ ] Monitor error rates for 30 minutes
- [ ] Check all health endpoints
- [ ] Verify core user flows
- [ ] Watch for performance regressions
- [ ] Monitor user feedback

### Daily Checks
- [ ] Error rate < 0.1%
- [ ] Response time < 1s p95
- [ ] No new error patterns
- [ ] All health checks passing
- [ ] External services healthy

### Weekly Reviews
- [ ] Performance trend analysis
- [ ] Error pattern review
- [ ] Feature usage metrics
- [ ] Security scan results
- [ ] User feedback analysis

## Documentation Updates

### After Each Incident
- [ ] Update runbook with lessons learned
- [ ] Document new procedures if needed
- [ ] Update contact information
- [ ] Review and improve processes
- [ ] Share knowledge with team

### Monthly Reviews
- [ ] Review incident reports
- [ ] Update procedures
- [ ] Check contact information
- [ ] Review escalation procedures
- [ ] Plan improvements

## Success Metrics

### Technical Success
- [ ] All tests passing
- [ ] No console errors
- [ ] Performance within targets
- [ ] Security verified
- [ ] External services healthy

### User Success
- [ ] Core functionality working
- [ ] No user reports of issues
- [ ] Performance feels fast
- [ ] Accessibility maintained
- [ ] User engagement normal

### Business Success
- [ ] No revenue impact
- [ ] User engagement maintained
- [ ] Feature adoption as expected
- [ ] No support tickets
- [ ] Positive user feedback

## Contact Information

### On-Call Rotation
- **Primary**: DevOps Team
- **Secondary**: Development Team
- **Escalation**: CTO
- **Emergency**: 24/7 on-call rotation

### External Services
- **Supabase**: Status page + support portal
- **Vercel**: Status page + support portal
- **Mapbox**: Status page + support portal
- **Sentry**: Status page + support portal
- **Upstash**: Status page + support portal

### Internal Contacts
- **DevOps**: devops@lootaura.com
- **Development**: dev@lootaura.com
- **Security**: security@lootaura.com
- **Support**: support@lootaura.com

---

**Remember**: When in doubt, rollback first and investigate second. User experience is the priority.
