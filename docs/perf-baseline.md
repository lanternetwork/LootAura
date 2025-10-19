# Performance Baseline & Monitoring

**Last updated: 2025-10-19**

## Core Web Vitals Targets

### LCP (Largest Contentful Paint)
- **Target**: < 2.5s
- **Good**: < 2.5s
- **Needs Improvement**: 2.5s - 4.0s
- **Poor**: > 4.0s

### FID (First Input Delay)
- **Target**: < 100ms
- **Good**: < 100ms
- **Needs Improvement**: 100ms - 300ms
- **Poor**: > 300ms

### CLS (Cumulative Layout Shift)
- **Target**: < 0.1
- **Good**: < 0.1
- **Needs Improvement**: 0.1 - 0.25
- **Poor**: > 0.25

### FCP (First Contentful Paint)
- **Target**: < 1.8s
- **Good**: < 1.8s
- **Needs Improvement**: 1.8s - 3.0s
- **Poor**: > 3.0s

### TTFB (Time to First Byte)
- **Target**: < 600ms
- **Good**: < 600ms
- **Needs Improvement**: 600ms - 1.5s
- **Poor**: > 1.5s

## Bundle Size Tracking

### Main Chunks to Monitor

| Chunk | Current Size | Target | Alert Threshold |
|-------|-------------|--------|-----------------|
| **Main App** | ~150KB | < 200KB | > 220KB |
| **Vendor** | ~300KB | < 400KB | > 440KB |
| **Map Components** | ~100KB | < 150KB | > 165KB |
| **Auth Components** | ~50KB | < 75KB | > 82KB |
| **CSS** | ~25KB | < 40KB | > 44KB |
| **Total** | ~625KB | < 865KB | > 950KB |

### Critical Dependencies
- **React**: ~45KB (core + hooks)
- **Next.js**: ~80KB (framework)
- **Supabase**: ~60KB (client + auth)
- **Mapbox GL**: ~200KB (map rendering)
- **React Query**: ~25KB (data fetching)
- **Zod**: ~15KB (validation)

### Bundle Analysis CI Job
The CI pipeline includes a bundle analysis job that:
- Extracts chunk sizes from build output
- Compares against baseline measurements
- Generates size regression reports
- Attaches build artifacts for review
- Warns on > 10% size increases

## Performance Monitoring

### API Response Times

| Endpoint | Target | Alert Threshold | Current p95 |
|----------|--------|----------------|-------------|
| **Sales API** | < 500ms | > 1s | ~300ms |
| **Markers API** | < 300ms | > 600ms | ~200ms |
| **Auth API** | < 200ms | > 400ms | ~150ms |
| **Upload API** | < 2s | > 4s | ~1.5s |
| **Share API** | < 100ms | > 200ms | ~80ms |

### Database Performance

| Metric | Target | Alert Threshold | Current |
|--------|--------|----------------|---------|
| **Query Time** | < 100ms | > 200ms | ~50ms |
| **Connection Pool** | < 80% | > 90% | ~60% |
| **Cache Hit Rate** | > 90% | < 80% | ~95% |
| **RLS Overhead** | < 10ms | > 20ms | ~5ms |

## Page Performance Targets

### Home Page (/)
- **LCP**: < 2.0s
- **FCP**: < 1.5s
- **CLS**: < 0.05
- **Bundle**: < 200KB

### Explore Page (/explore)
- **LCP**: < 2.5s
- **FCP**: < 2.0s
- **CLS**: < 0.1
- **Bundle**: < 300KB

### Map Page (/explore?tab=map)
- **LCP**: < 3.0s
- **FCP**: < 2.5s
- **CLS**: < 0.1
- **Bundle**: < 400KB

### Add Sale Page (/explore?tab=add)
- **LCP**: < 2.0s
- **FCP**: < 1.5s
- **CLS**: < 0.05
- **Bundle**: < 250KB

## Monitoring Implementation

### CI Bundle Analysis
```yaml
# Automated bundle size tracking
- name: Bundle Size Analysis
  run: |
    npm run build
    npm run analyze:bundle
    # Generates size report and compares to baseline
```

### Performance Budgets
- **Total Bundle**: < 865KB (current: ~625KB)
- **Main Chunk**: < 200KB (current: ~150KB)
- **Vendor Chunk**: < 400KB (current: ~300KB)
- **CSS**: < 40KB (current: ~25KB)

### Regression Detection
- **Size Increase**: > 10% triggers warning
- **Performance Drop**: > 20% slower triggers alert
- **New Dependencies**: Automatic impact assessment
- **Bundle Splitting**: Automatic chunk optimization

## Optimization Strategies

### Code Splitting
- **Route-based**: Each page loads only required code
- **Component-based**: Heavy components loaded on demand
- **Library-based**: Vendor chunks separated by usage

### Asset Optimization
- **Image Optimization**: WebP with fallbacks
- **Font Loading**: Preload critical fonts
- **CSS Optimization**: Purge unused styles
- **JavaScript**: Tree shaking and minification

### Caching Strategy
- **Static Assets**: Long-term caching (1 year)
- **API Responses**: Short-term caching (5 minutes)
- **Database Queries**: In-memory caching (1 minute)
- **CDN**: Edge caching for global performance

## Performance Testing

### Load Testing
- **Concurrent Users**: 100-1000 users
- **API Endpoints**: All endpoints under load
- **Database**: Query performance under load
- **External Services**: Mapbox, Supabase limits

### Stress Testing
- **Memory Usage**: Heap size under load
- **CPU Usage**: Processing under load
- **Network**: Bandwidth under load
- **Database**: Connection pool limits

### Regression Testing
- **Bundle Size**: Automated size checks
- **Performance**: Automated performance checks
- **Functionality**: Feature regression testing
- **Accessibility**: A11y regression testing

## Baseline Measurements

### Current Performance (2025-10-19)
- **LCP**: 1.8s (Good)
- **FID**: 45ms (Good)
- **CLS**: 0.02 (Good)
- **FCP**: 1.2s (Good)
- **TTFB**: 180ms (Good)

### Bundle Sizes (2025-10-19)
- **Main App**: 145KB
- **Vendor**: 285KB
- **Map Components**: 95KB
- **Auth Components**: 45KB
- **CSS**: 22KB
- **Total**: 592KB

### API Performance (2025-10-19)
- **Sales API**: 280ms p95
- **Markers API**: 180ms p95
- **Auth API**: 120ms p95
- **Upload API**: 1.2s p95
- **Share API**: 65ms p95

## Monitoring Alerts

### Critical Alerts
- **Bundle Size**: > 10% increase
- **Performance**: > 20% slower
- **Errors**: > 1% error rate
- **Availability**: < 99.9% uptime

### Warning Alerts
- **Bundle Size**: > 5% increase
- **Performance**: > 10% slower
- **Errors**: > 0.5% error rate
- **Memory**: > 80% heap usage

### Info Alerts
- **New Dependencies**: Added to bundle
- **Performance Trends**: Weekly trends
- **Feature Usage**: Adoption rates
- **Security**: Dependency updates
