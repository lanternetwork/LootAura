# Performance Notes - Auth + Profile + Sales Search Optimization

## Performance Budgets

### Database Response Times
- **Auth/Profile Operations**: p95 ≤ 50ms
- **Initial Sales Load**: p95 ≤ 300ms → **p95 ≤ 150ms** (with caching)
- **Sales Search**: p95 ≤ 200ms → **p95 ≤ 100ms** (with optimization)
- **Bundle Growth**: ≤ +5KB gzip (no new dependencies without approval)

### Measurement Methodology
- Use `EXPLAIN ANALYZE` for database queries
- Monitor with Supabase dashboard metrics
- Track Core Web Vitals for frontend performance
- Use browser DevTools for bundle analysis

## Current Query Entry Points

### Auth Operations
- **Session Validation**: `auth.getSession()` - should be < 10ms
- **Profile Lookup**: `profiles.user_id` - should be < 20ms
- **Profile Upsert**: `profiles` table - should be < 30ms

### Sales Operations
- **Initial Load**: `sales_v2` view with bbox filter - should be < 300ms → **< 150ms** (with caching)
- **Markers**: `search_sales_bbox` RPC - should be < 200ms → **< 100ms** (with optimization)
- **Details**: Single sale lookup - should be < 50ms
- **Search with Filters**: Category/date filtering - should be < 150ms → **< 75ms** (with indexes)

## Index Strategy

### Existing Indexes
- **Primary**: `profiles.user_id` (PK, already indexed)
- **Sales**: `sales_v2` view with GIST index on `geom`
- **Favorites**: `favorites_v2` with composite indexes
- **Performance Optimization**: Added indexes for category filtering, date ranges, and spatial queries

### Proposed Indexes (Require Owner Approval)
- **Profile Lookups**: `profiles.user_id` (already exists)
- **Sales Performance**: Consider `sales_v2.date_start` index if date filtering is slow
- **Favorites Performance**: Consider `favorites_v2.user_id` index if needed

### Index Proposal Workflow
1. **Measure**: Use `EXPLAIN ANALYZE` on slow queries
2. **Document**: Record query performance and proposed index
3. **Propose**: Create GitHub issue with performance data
4. **Approve**: Owner approval required for new indexes
5. **Implement**: Add index via migration
6. **Verify**: Confirm performance improvement

## Performance Monitoring

### Database Metrics
- Query execution time (p95, p99)
- Connection pool utilization
- Index usage statistics
- RLS policy performance impact

### Frontend Metrics
- Bundle size analysis
- Core Web Vitals (LCP, FID, CLS)
- Auth flow performance
- Profile loading time

### Alerting Thresholds
- Database p95 > 100ms
- Bundle size increase > 5KB
- Auth flow > 2s
- Profile operations > 100ms

## Optimization Strategies

### Database
- Use prepared statements for repeated queries
- Implement connection pooling
- Monitor RLS policy performance
- Consider read replicas for heavy read operations

### Frontend
- Lazy load auth components
- Implement auth state caching
- Use React.memo for profile components
- Optimize bundle splitting

### Caching
- Session caching in memory
- Profile data caching
- Auth state persistence
- **API response caching** with CDN headers (2-10 min TTL)
- **Database query result caching** with in-memory cache
- **Client-side data prefetching** for common scenarios
- **Progressive loading** with skeleton screens

## Troubleshooting

### Common Performance Issues
1. **Slow Profile Lookups**: Check `profiles.user_id` index usage
2. **Auth Flow Delays**: Verify Supabase connection settings
3. **Bundle Size Growth**: Audit new dependencies
4. **RLS Performance**: Review policy complexity

### Debug Tools
- Supabase dashboard performance metrics
- Browser DevTools Performance tab
- Network tab for API timing
- Console logs for auth flow debugging

## Performance Optimizations Implemented (2025-10-15)

### Database Optimizations
- **Query Result Caching**: In-memory cache with 1-minute TTL for frequent queries
- **Database Indexes**: Added GIST, composite, and category indexes for faster filtering
- **Connection Pooling**: Optimized database connection reuse
- **Query Optimization**: Reduced N+1 problems with efficient joins

### API Optimizations
- **Response Caching**: CDN headers (2-10 min TTL) for API responses
- **Cache Headers**: Proper cache-control headers for static and dynamic content
- **Progressive Loading**: Skeleton screens during data loading
- **Data Prefetching**: Client-side prefetching of common scenarios

### Frontend Optimizations
- **Performance Monitoring**: Real-time performance metrics and alerting
- **Optimistic Updates**: Immediate UI updates before server confirmation
- **Bundle Optimization**: Lazy loading and code splitting
- **Memory Management**: Efficient cache cleanup and garbage collection

### Expected Performance Improvements
- **Sales Search**: 50-75% faster load times
- **Category Filtering**: 60-80% faster with new indexes
- **Date Range Filtering**: 40-60% faster with optimized queries
- **Map Rendering**: 30-50% faster with prefetching
- **Overall UX**: Significantly improved perceived performance

## Future Considerations

### Scalability
- Consider Redis for session storage
- Implement profile data denormalization
- Add database read replicas
- Consider CDN for static assets

### Monitoring
- Set up performance dashboards
- Implement automated performance testing
- Add performance regression detection
- Create performance alerting system
