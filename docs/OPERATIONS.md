# Operations Guide

**Last updated: 2025-01-27 — Rate Limiting Operations**

## Rate Limiting Operations

### Policy Tuning

Rate limiting policies can be adjusted in `lib/rateLimit/policies.ts`:

```typescript
export const Policies = {
  AUTH_DEFAULT: { name: 'AUTH_DEFAULT', limit: 5, windowSec: 30, scope: 'ip' },
  // ... other policies
}
```

**Common Tuning Scenarios:**

- **High Auth Failures**: Increase `AUTH_DEFAULT.limit` or `AUTH_HOURLY.limit`
- **Map Panning Issues**: Increase `SALES_VIEW_30S.limit` or adjust `burstSoft`
- **Geocoding Bottlenecks**: Increase `GEO_ZIP_SHORT.limit` or `GEO_ZIP_HOURLY.limit`
- **Mutation Spam**: Decrease `MUTATE_MINUTE.limit` or `MUTATE_DAILY.limit`

### Reading Rate Limit Headers

All API responses include rate limiting headers:

```
X-RateLimit-Limit: 5          # Maximum requests allowed
X-RateLimit-Remaining: 3      # Requests remaining in window
X-RateLimit-Reset: 1640995200 # Unix timestamp when window resets
X-RateLimit-Policy: AUTH_DEFAULT 5/30  # Policy name and limits
Retry-After: 30               # Seconds to wait (429 responses only)
```

**Header Interpretation:**
- `Remaining: 0` + No `Retry-After` = Soft limit (burst allowed)
- `Remaining: 0` + `Retry-After` = Hard limit (blocked)
- `Remaining > 0` = Within limits

### Flipping the Rate Limit Flag

**Enable Rate Limiting:**
```bash
# In Vercel dashboard
RATE_LIMITING_ENABLED=true

# Or via CLI
vercel env add RATE_LIMITING_ENABLED true production
```

**Disable Rate Limiting:**
```bash
# Remove the environment variable
vercel env rm RATE_LIMITING_ENABLED production

# Or set to false
vercel env add RATE_LIMITING_ENABLED false production
```

**Verification:**
```bash
# Check if rate limiting is active
curl -I https://your-domain.com/api/auth/signin

# Should see X-RateLimit-* headers when enabled
# Should NOT see X-RateLimit-* headers when disabled
```

### Upstash Redis Setup

1. **Create Upstash Database:**
   - Go to [Upstash Console](https://console.upstash.com/)
   - Create new Redis database
   - Choose region closest to your Vercel deployment

2. **Get Credentials:**
   ```bash
   # Copy from Upstash dashboard
   UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-token
   ```

3. **Configure Vercel:**
   ```bash
   vercel env add UPSTASH_REDIS_REST_URL "https://your-db.upstash.io" production
   vercel env add UPSTASH_REDIS_REST_TOKEN "your-token" production
   ```

4. **Test Connection:**
   ```bash
   # Check admin tools at /admin/tools
   # Should show "Upstash Redis" backend when configured
   ```

### Monitoring Rate Limits

**Admin Tools Dashboard:**
- Visit `/admin/tools` (debug mode only)
- View "Rate Limiting Status" tile
- Shows: enabled/disabled, backend type, active policies, recent blocks

**Log Monitoring:**
```bash
# Look for rate limit blocks in logs
[RATE_LIMIT] block id=AUTH_DEFAULT key=ip:192.168.1.1 over_by=2
```

**Metrics Collection:**
- Rate limit blocks are logged to performance metrics
- Available via `/api/performance/metrics` endpoint
- Can be integrated with monitoring systems

### Troubleshooting

**Common Issues:**

1. **Rate Limiting Not Working:**
   - Check `NODE_ENV === 'production'`
   - Verify `RATE_LIMITING_ENABLED === 'true'`
   - Confirm Redis credentials are set

2. **Too Many 429s:**
   - Check if limits are too strict
   - Verify legitimate users aren't being blocked
   - Consider increasing limits or adjusting windows

3. **Redis Connection Issues:**
   - Verify Upstash credentials
   - Check network connectivity
   - System falls back to in-memory storage

4. **Headers Missing:**
   - Rate limiting is bypassed (check environment)
   - Headers only present when rate limiting is active

**Debug Commands:**
```bash
# Test rate limiting locally
NODE_ENV=production RATE_LIMITING_ENABLED=true npm run dev

# Check environment variables
vercel env ls production

# Test specific endpoint
curl -v https://your-domain.com/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
```

### Performance Considerations

**Redis vs Memory:**
- **Redis**: Production-ready, persistent, shared across instances
- **Memory**: Development-only, resets on restart, single instance

**Window Size Impact:**
- Smaller windows = more precise limiting but higher Redis usage
- Larger windows = less Redis usage but less precise limiting

**Policy Complexity:**
- Multiple policies per endpoint = more Redis calls
- Consider combining policies when possible

### Security Considerations

**IP Spoofing:**
- Rate limiting trusts `X-Forwarded-For` headers
- Ensure reverse proxy strips untrusted headers
- Consider additional validation for sensitive endpoints

**User-Based Limits:**
- Mutation limits use user ID when authenticated
- Falls back to IP when no session
- Prevents authenticated users from bypassing limits

**Bypass Controls:**
- Rate limiting disabled by default
- Only enabled in production with explicit flag
- Preview deployments bypass unless explicitly enabled
