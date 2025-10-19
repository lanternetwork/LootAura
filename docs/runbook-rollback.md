# Rollback Runbook

**Last updated: 2025-10-19**

## Emergency Rollback Procedures

### 🚨 Share Endpoints Spike 5xx Errors

**Immediate Actions:**
1. **Disable Share Feature**: Set `NEXT_PUBLIC_FLAG_SHARE_LINKS=false`
2. **Revert to Last Stable**: `git revert <commit-hash>` or `git checkout <stable-tag>`
3. **Purge CDN**: Clear Vercel/Cloudflare cache
4. **Confirm Health**: Check `/api/health` endpoint

**Rollback Steps:**
```bash
# 1. Disable feature flag
NEXT_PUBLIC_FLAG_SHARE_LINKS=false

# 2. Revert to stable tag
git checkout v1.2.3
git push origin main --force

# 3. Purge CDN (Vercel)
vercel --prod --force

# 4. Verify health
curl https://lootaura.com/api/health
```

### 🔄 Re-enable After Stabilization

**When to Re-enable:**
- 5xx errors < 0.1% for 30 minutes
- All health checks passing
- No new error patterns in logs

**Re-enable Steps:**
```bash
# 1. Re-enable feature flag
NEXT_PUBLIC_FLAG_SHARE_LINKS=true

# 2. Deploy with monitoring
git checkout main
git push origin main

# 3. Monitor for 15 minutes
# Check Sentry, Vercel logs, and health endpoints
```

## Smoke Test Checklist

### ✅ Create Share → Open Shortlink (Anonymous)

**Test Steps:**
1. **Create Sale**: Add a new sale with title "Rollback Test Sale"
2. **Generate Share**: Click share button, copy shortlink
3. **Open Shortlink**: Open in incognito/private window
4. **Verify State**: Confirm map viewport and filters are preserved
5. **Test Anonymous**: Ensure no authentication required

**Expected Results:**
- ✅ Share link generated successfully
- ✅ Shortlink resolves to correct viewport
- ✅ Anonymous access works
- ✅ No console errors
- ✅ Map renders with correct markers

### ✅ Favorite Toggle (RLS Verification)

**Test Steps:**
1. **Sign In**: Authenticate with test account
2. **Toggle Favorite**: Click favorite button on a sale
3. **Verify RLS**: Check that only own favorites are visible
4. **Cross-User Test**: Try to access another user's favorites (should fail)

**Expected Results:**
- ✅ Favorite toggle works for authenticated users
- ✅ RLS prevents cross-user access
- ✅ No 42501 errors in console
- ✅ Favorites persist across sessions

## Health Check Endpoints

### Primary Health Checks
- **Main App**: `https://lootaura.com/` (200 OK)
- **API Health**: `https://lootaura.com/api/health` (200 OK)
- **Database**: Supabase connection (no 500 errors)
- **Mapbox**: Map renders without errors

### Secondary Health Checks
- **Share API**: `https://lootaura.com/api/share` (POST/GET)
- **Auth API**: `https://lootaura.com/api/auth/signin` (POST)
- **Upload API**: `https://lootaura.com/api/upload/signed-url` (POST)

## Rollback Decision Matrix

| Symptom | Action | Timeout | Rollback Target |
|---------|--------|---------|-----------------|
| Share 5xx > 5% | Disable share flag | 5 minutes | Last stable tag |
| Auth 5xx > 2% | Check Supabase | 10 minutes | Previous deployment |
| Map errors > 1% | Check Mapbox token | 5 minutes | Disable clustering |
| Database 5xx > 1% | Check Supabase status | 15 minutes | Previous migration |
| Console errors | Check guardrail | 2 minutes | Previous test suite |

## Post-Rollback Verification

### ✅ Immediate Checks (0-5 minutes)
- [ ] Health endpoints responding
- [ ] No 5xx errors in logs
- [ ] Core functionality working
- [ ] No console errors

### ✅ Extended Checks (5-30 minutes)
- [ ] Share functionality (if re-enabled)
- [ ] Authentication flows
- [ ] Map rendering
- [ ] Database operations
- [ ] Performance metrics normal

### ✅ Full Verification (30+ minutes)
- [ ] All smoke tests passing
- [ ] No error spikes
- [ ] User reports normal
- [ ] Monitoring dashboards green

## Communication Plan

### Internal Notification
- **Slack**: #alerts channel
- **Email**: ops@lootaura.com
- **Status Page**: Update if > 5 minutes downtime

### External Communication
- **Status Page**: Automated updates
- **Social Media**: If > 15 minutes downtime
- **User Notifications**: In-app banner if > 30 minutes

## Prevention Measures

### Pre-Deployment
- [ ] Run full test suite
- [ ] Smoke test in staging
- [ ] Check environment parity
- [ ] Verify rollback plan

### Post-Deployment
- [ ] Monitor error rates for 30 minutes
- [ ] Check all health endpoints
- [ ] Verify core user flows
- [ ] Watch for performance regressions

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

## Contact Information

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
