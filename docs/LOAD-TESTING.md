# LootAura Load Testing Documentation

This document describes the comprehensive load testing framework for validating LootAura's rate limiting system in production-like conditions.

## Overview

The load testing harness validates all rate limiting policies through realistic traffic patterns, ensuring the system can handle expected loads while protecting against abuse. All tests are designed to be non-intrusive and safe for production environments.

## Quick Start

### Prerequisites

1. **Local Development Server**: Start LootAura locally
   ```bash
   npm run dev
   ```

2. **Production-like Testing**: Use local test mode with production settings
   ```bash
   npm run load:local
   ```

3. **Staging Environment**: Test against staging (preferred)
   ```bash
   npm run load:suite:staging
   ```

### Basic Usage

```bash
# Run individual scenarios
npm run load:sales:baseline
npm run load:sales:burst
npm run load:geo:abuse

# Run complete test suite
npm run load:suite

# Run with custom parameters
tsx scripts/load/cli.ts --scenario sales-burst --baseURL https://staging.lootaura.com --ip 192.168.1.200
```

## Available Scenarios

### Sales Viewport Tests

| Scenario | Concurrency | Duration | Target RPS | Purpose |
|----------|-------------|----------|------------|---------|
| `sales-baseline` | 5 | 60s | 10 | Normal usage patterns |
| `sales-burst` | 20 | 45s | 80 | Soft-then-hard limit testing |
| `sales-sustained` | 10 | 120s | 40 | Long-term stability |

**Expected Behavior:**
- `SALES_VIEW_30S`: 20 req/30s + 2 burst/5s
- `SALES_VIEW_HOURLY`: 800 req/1h
- Soft limits allow bursts, hard limits return 429 with Retry-After

### Geocoding Tests

| Scenario | Concurrency | Duration | Target RPS | Purpose |
|----------|-------------|----------|------------|---------|
| `geo-cache-warmup` | 2 | 30s | 5 | Cache behavior validation |
| `geo-abuse` | 5 | 30s | 30 | Rate limit enforcement |

**Expected Behavior:**
- `GEO_ZIP_SHORT`: 10 req/60s
- `GEO_ZIP_HOURLY`: 300 req/1h
- All 429 responses include Retry-After header

### Authentication Tests

| Scenario | Concurrency | Duration | Target RPS | Purpose |
|----------|-------------|----------|------------|---------|
| `auth-signin` | 5 | 30s | 20 | Login rate limiting |
| `auth-magic-link` | 5 | 30s | 20 | Magic link rate limiting |

**Expected Behavior:**
- `AUTH_DEFAULT`: 5 req/30s
- `AUTH_HOURLY`: 60 req/1h
- IP-based limiting for security

### Mutation Tests

| Scenario | Concurrency | Duration | Target RPS | Purpose |
|----------|-------------|----------|------------|---------|
| `mutation-sales` | 2 | 60s | 6 | User-scoped limiting |

**Expected Behavior:**
- `MUTATE_MINUTE`: 3 req/60s per user
- `MUTATE_DAILY`: 100 req/24h per user
- Falls back to IP if no user session

### Multi-IP Tests

| Scenario | Concurrency | Duration | Target RPS | Purpose |
|----------|-------------|----------|------------|---------|
| `multi-ip-sales` | 10 | 60s | 50 | IP isolation validation |

**Expected Behavior:**
- Each IP gets independent rate limit buckets
- No cross-contamination between IPs

## Command Reference

### Individual Scenarios

```bash
# Sales viewport tests
npm run load:sales:baseline
npm run load:sales:burst
npm run load:sales:sustained

# Geocoding tests
npm run load:geo:cache
npm run load:geo:abuse

# Authentication tests
npm run load:auth:signin
npm run load:auth:magic

# Mutation tests
npm run load:mutation:sales

# Multi-IP tests
npm run load:multi:ip
```

### Test Suites

```bash
# Complete test suite (local)
npm run load:suite

# Complete test suite (staging)
npm run load:suite:staging

# Local production-like testing
npm run load:local
npm run load:local:burst
```

### Custom Parameters

```bash
# Custom base URL
tsx scripts/load/cli.ts --scenario sales-burst --baseURL https://staging.lootaura.com

# Custom IP address
tsx scripts/load/cli.ts --scenario sales-baseline --ip 192.168.1.200

# User token for mutation tests
tsx scripts/load/cli.ts --scenario mutation-sales --userToken "your-jwt-token"

# Multiple scenarios
tsx scripts/load/suite.ts --scenarios sales-baseline,sales-burst,geo-abuse
```

## Output and Artifacts

### Console Output

Each test provides real-time feedback:

```
🚀 Starting load test: sales-burst
   URL: http://localhost:3000/api/sales?bbox=38.2627,-85.7485,38.2427,-85.7685
   Concurrency: 20
   Duration: 45s
   Target RPS: 80

[Worker 0] 200 45ms | X-RateLimit: 20/19
[Worker 1] 200 52ms | X-RateLimit: 20/18
...
[Worker 5] 429 38ms | X-RateLimit: 20/0 | Retry-After: 30

📊 Load Test Summary
==================================================
Scenario: sales-burst
Total Requests: 1,247
Success Rate: 87.3%
429 Errors: 159
Median Latency: 45ms
95th Percentile: 89ms
Time to First 429: 12.3s
Burst Window: 13s
Sustained Throughput: 18.2 req/s
```

### Artifacts

All test results are saved to `/tmp/lootaura-load/` (or `./load-test-results/` as fallback):

- **CSV Files**: Per-request metrics with timestamps, status codes, latencies, and rate limit headers
- **JSON Files**: Aggregated statistics and configuration
- **Report**: Comprehensive markdown report with findings and recommendations

### Sample CSV Output

```csv
timestamp,status,latencyMs,rateLimitLimit,rateLimitRemaining,retryAfter,responseSize
1701234567890,200,45,20,19,,1024
1701234567891,200,52,20,18,,1024
1701234567892,429,38,20,0,30,256
```

## Environment Configuration

### Local Testing

For local testing with production-like behavior:

```bash
# Automatically sets NODE_ENV=production and RATE_LIMITING_ENABLED=true
npm run load:local
```

### Staging Testing

For staging environment testing:

```bash
# Test against staging with production rate limiting
npm run load:suite:staging
```

### Production Testing

⚠️ **Caution**: Only run against production with explicit approval and during low-traffic periods.

```bash
# Test against production (use with extreme caution)
tsx scripts/load/suite.ts --baseURL https://lootaura.com
```

## Rate Limiting Policies Tested

| Policy | Limit | Window | Scope | Test Scenario |
|--------|-------|--------|-------|----------------|
| `SALES_VIEW_30S` | 20 req | 30s | IP | sales-burst |
| `SALES_VIEW_HOURLY` | 800 req | 1h | IP | sales-sustained |
| `GEO_ZIP_SHORT` | 10 req | 60s | IP | geo-abuse |
| `GEO_ZIP_HOURLY` | 300 req | 1h | IP | geo-abuse |
| `AUTH_DEFAULT` | 5 req | 30s | IP | auth-signin, auth-magic-link |
| `AUTH_HOURLY` | 60 req | 1h | IP | auth-signin, auth-magic-link |
| `MUTATE_MINUTE` | 3 req | 60s | User | mutation-sales |
| `MUTATE_DAILY` | 100 req | 24h | User | mutation-sales |

## Expected Behaviors

### Soft-Then-Hard Limits

Sales viewport tests demonstrate soft-then-hard behavior:

1. **Normal Phase**: Requests succeed with decreasing `X-RateLimit-Remaining`
2. **Soft Limit**: Requests succeed with `X-RateLimit-Remaining: 0` (no Retry-After)
3. **Hard Limit**: Requests return 429 with Retry-After header

### Header Consistency

All responses include rate limiting headers:

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Window reset timestamp
- `X-RateLimit-Policy`: Policy name and limits
- `Retry-After`: Seconds to wait (429 responses only)

### IP Isolation

Multi-IP tests verify that different IP addresses get independent rate limit buckets:

- Each IP gets its own 20 req/30s allowance
- No cross-contamination between IPs
- Consistent behavior across different IP ranges

## Troubleshooting

### Common Issues

1. **No 429 Responses**: Rate limiting may be disabled
   - Check `RATE_LIMITING_ENABLED=true`
   - Verify `NODE_ENV=production`

2. **Missing Headers**: Headers not being set
   - Verify rate limiting middleware is active
   - Check for bypass conditions

3. **High Latency**: Performance issues
   - Check Redis connectivity (if using Upstash)
   - Verify in-memory fallback is working

4. **Test Failures**: Network or server issues
   - Verify target URL is accessible
   - Check server logs for errors

### Debug Mode

Enable debug logging for detailed rate limiting information:

```bash
NEXT_PUBLIC_DEBUG=true npm run load:local
```

## Safety Guidelines

### Production Safety

- ✅ **Safe**: Testing against staging environments
- ✅ **Safe**: Local testing with production settings
- ⚠️ **Caution**: Production testing during low traffic
- ❌ **Dangerous**: Production testing during peak hours

### Rate Limit Considerations

- Tests are designed to trigger rate limits intentionally
- 429 responses are expected and indicate correct behavior
- Tests automatically stop after configured duration
- No permanent changes to application state

### Resource Usage

- Tests use minimal resources (lightweight HTTP requests)
- No external dependencies beyond Node.js built-in fetch
- Results are saved locally, no external data transmission
- Tests exit cleanly with appropriate status codes

## Integration with CI/CD

### CI Integration

Load tests are **not** run in CI by default to avoid:
- External dependencies on staging/production
- Potential impact on shared environments
- Flaky tests due to network conditions

### Manual Validation

Run load tests manually before:
- Production deployments
- Rate limiting policy changes
- Performance optimizations
- Security hardening updates

### Automated Reporting

Consider integrating load test reports into:
- Deployment pipelines
- Performance monitoring dashboards
- Security audit processes
- Capacity planning workflows

## Advanced Usage

### Custom Scenarios

Create custom scenarios by extending the scenarios module:

```typescript
// scripts/load/custom-scenarios.ts
export function customScenario(options: ScenarioOptions = {}): LoadTestConfig {
  return {
    baseURL: options.baseURL || 'http://localhost:3000',
    concurrency: 3,
    durationSec: 30,
    targetRps: 15,
    method: 'GET',
    url: '/api/custom-endpoint',
    label: 'custom-test'
  }
}
```

### Custom Metrics

Extend the metrics collection for specific requirements:

```typescript
// Custom metric collection
const customMetrics = {
  ...baseMetrics,
  customField: 'custom-value'
}
```

### Integration Testing

Combine load tests with other validation:

```bash
# Run load tests after deployment
npm run load:suite:staging && npm run test:e2e
```

## Conclusion

The LootAura load testing framework provides comprehensive validation of rate limiting policies through realistic traffic patterns. It ensures the system can handle expected loads while protecting against abuse, with clear reporting and safe operation guidelines.

For questions or issues, refer to the test artifacts and console output for detailed diagnostics.
