# Observability & Monitoring

**Last updated: 2025-10-19**

## Alert Thresholds

### Critical Alerts (Immediate Response)
- **Share API 5xx**: > 0.5% error rate over 10 minutes
- **Auth API 5xx**: > 1% error rate over 10 minutes
- **Database 5xx**: > 0.1% error rate over 5 minutes
- **Bundle Size**: > 10% increase vs baseline

### Warning Alerts (Investigation Required)
- **API Response Time**: > 2s p95 over 15 minutes
- **Database Query Time**: > 1s p95 over 15 minutes
- **Memory Usage**: > 80% heap utilization
- **Cache Hit Rate**: < 70% over 30 minutes

### Info Alerts (Monitoring)
- **New Error Patterns**: First occurrence of new error types
- **Performance Regression**: > 20% slower than baseline
- **Feature Flag Changes**: Feature flag toggles

## Monitoring Sources

### CI/CD Pipeline
- **Build Status**: GitHub Actions workflow status
- **Test Results**: Unit, integration, and E2E test outcomes
- **Bundle Analysis**: Size regression detection
- **Security Scans**: Dependency vulnerability checks

### Application Monitoring
- **Error Tracking**: Sentry for real-time error monitoring
- **Performance**: Web Vitals for Core Web Vitals metrics
- **Database**: Supabase monitoring for query performance
- **External Services**: Mapbox, Redis, CDN status

### Infrastructure Monitoring
- **Hosting**: Vercel deployment status and metrics
- **CDN**: Cache hit rates and edge performance
- **Database**: Supabase connection pool and query performance
- **External APIs**: Mapbox, Sentry, Redis service status

## CI Job: Bundle Size & Metrics

### Job Description
A lightweight CI job that records bundle size and key performance metrics to detect regressions without failing the pipeline.

### Implementation
```yaml
# .github/workflows/monitoring.yml
name: Monitoring & Metrics
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  bundle-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - name: Analyze Bundle Size
        run: |
          # Extract bundle sizes
          echo "## Bundle Size Report" >> $GITHUB_STEP_SUMMARY
          echo "| Chunk | Size | Change |" >> $GITHUB_STEP_SUMMARY
          echo "|-------|------|--------|" >> $GITHUB_STEP_SUMMARY
          
          # Record metrics (warn only, don't fail)
          if [ "$SIZE_INCREASE" -gt 10 ]; then
            echo "⚠️ Bundle size increased by $SIZE_INCREASE%"
          fi
```

### Metrics Collected
- **Bundle Sizes**: Main chunks, vendor chunks, CSS
- **Performance**: Build time, test execution time
- **Quality**: Test coverage, linting results
- **Security**: Dependency vulnerabilities

### Alerting Rules
- **Bundle Size**: Warn if > 10% increase
- **Build Time**: Warn if > 50% slower than baseline
- **Test Coverage**: Warn if < 80% coverage
- **Dependencies**: Alert on high/critical vulnerabilities

## PII Scrubbing & Log Hygiene

### Redacted Sample Log Block
```json
{
  "timestamp": "2025-10-19T10:30:00Z",
  "level": "info",
  "event": "user_action",
  "action": "sale_created",
  "user_id": "***REDACTED***",
  "sale_id": "sale_12345",
  "location": {
    "lat": 38.2527,
    "lng": -85.7585,
    "city": "Louisville",
    "state": "KY"
  },
  "metadata": {
    "ip_hash": "***REDACTED***",
    "user_agent": "Mozilla/5.0...",
    "session_id": "***REDACTED***"
  }
}
```

### Intentionally Omitted Fields
- **User Emails**: Never logged in client or server logs
- **Auth Tokens**: Never included in any log output
- **Personal Data**: Names, addresses, phone numbers excluded
- **Session Data**: Session tokens and cookies excluded
- **IP Addresses**: Hashed or omitted entirely

### PII Scrubbing Verification

#### Client-Side Logging
- [ ] **No User Emails**: No email addresses in console logs
- [ ] **No Auth Tokens**: No authentication tokens in logs
- [ ] **No Personal Data**: No names, addresses, phone numbers
- [ ] **No Session Data**: No session tokens or cookies
- [ ] **No IP Addresses**: No IP addresses in client logs

#### Server-Side Logging
- [ ] **Hashed User IDs**: User IDs are hashed or redacted
- [ ] **No Sensitive Data**: No sensitive user data in logs
- [ ] **Error Context**: Error messages don't include PII
- [ ] **Debug Gates**: Debug logs are properly gated
- [ ] **Log Rotation**: Logs are rotated and purged regularly

#### Logging Standards
- **Structured Format**: JSON format with consistent fields
- **Event Names**: Descriptive event identifiers
- **Minimal Context**: Only necessary context without PII
- **Debug Gates**: All debug logs behind `NEXT_PUBLIC_DEBUG`
- **Error Context**: Stack traces without sensitive data

### Logging Standards
- **Structured Logs**: JSON format with consistent fields
- **Event Names**: Descriptive event identifiers
- **Context**: Minimal context without PII
- **Debug Gates**: All debug logs behind `NEXT_PUBLIC_DEBUG`
- **Error Context**: Stack traces without sensitive data

## Performance Baselines

### Core Web Vitals Targets
- **LCP (Largest Contentful Paint)**: < 2.5s
- **FID (First Input Delay)**: < 100ms
- **CLS (Cumulative Layout Shift)**: < 0.1
- **FCP (First Contentful Paint)**: < 1.8s
- **TTFB (Time to First Byte)**: < 600ms

### API Performance Targets
- **Sales API**: < 500ms p95
- **Markers API**: < 300ms p95
- **Auth API**: < 200ms p95
- **Upload API**: < 2s p95
- **Share API**: < 100ms p95

### Database Performance Targets
- **Query Time**: < 100ms p95
- **Connection Pool**: < 80% utilization
- **Cache Hit Rate**: > 90%
- **RLS Overhead**: < 10ms per query

## Monitoring Dashboard

### Real-time Metrics
- **Error Rate**: 5xx errors per minute
- **Response Time**: API response time p95
- **Throughput**: Requests per second
- **User Activity**: Active users, page views

### Historical Trends
- **Daily/Weekly Reports**: Performance trends
- **Error Patterns**: Common error types
- **Feature Usage**: Feature flag adoption
- **Performance Regression**: Slow queries, slow pages

### Alert Channels
- **Slack**: #alerts channel for critical issues
- **Email**: ops@lootaura.com for warnings
- **PagerDuty**: For critical production issues
- **Status Page**: Public status updates

## Troubleshooting Guide

### High Error Rates
1. **Check External Services**: Supabase, Mapbox, Redis status
2. **Review Recent Changes**: Deployments, feature flags
3. **Analyze Error Patterns**: Common error types and frequencies
4. **Check Resource Usage**: Memory, CPU, database connections

### Performance Degradation
1. **Bundle Analysis**: Check for size increases
2. **Database Queries**: Review slow query logs
3. **Cache Performance**: Check hit rates and TTL
4. **External Dependencies**: API response times

### Memory Issues
1. **Heap Analysis**: Check for memory leaks
2. **Bundle Size**: Verify no large dependencies
3. **Cache Management**: Review cache cleanup
4. **Worker Processes**: Check worker memory usage

## Maintenance Procedures

### Daily Checks
- [ ] Error rate < 0.1%
- [ ] Response time < 1s p95
- [ ] No new error patterns
- [ ] All health checks passing

### Weekly Reviews
- [ ] Performance trend analysis
- [ ] Error pattern review
- [ ] Feature usage metrics
- [ ] Security scan results

### Monthly Audits
- [ ] Log retention policy
- [ ] Alert threshold tuning
- [ ] Monitoring coverage review
- [ ] PII scrubbing verification
