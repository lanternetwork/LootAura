# Performance Monitoring & Database Optimization

This document outlines the comprehensive performance monitoring system and database optimization strategies implemented for LootAura.

## Overview

The performance monitoring system ensures optimal database performance, query efficiency, and application responsiveness through strategic indexing, query optimization, and real-time monitoring.

## Performance Targets

### Database Performance
- **Auth Operations**: p95 ≤ 50ms
- **Sales Queries**: p95 ≤ 300ms
- **Profile Operations**: p95 ≤ 100ms
- **Spatial Queries**: p95 ≤ 500ms

### Application Performance
- **Page Load Time**: < 2 seconds
- **API Response Time**: < 500ms
- **Database Connection Pool**: 95% availability
- **Memory Usage**: < 512MB per instance

## Database Indexes

### Core Performance Indexes

#### Sales Table Indexes
```sql
-- Spatial queries (most common)
CREATE INDEX idx_sales_spatial_public 
ON lootaura_v2.sales USING GIST (geom) 
WHERE status = 'published' AND geom IS NOT NULL;

-- Date range filtering
CREATE INDEX idx_sales_date_public 
ON lootaura_v2.sales (date_start, date_end, status) 
WHERE status = 'published';

-- Text search optimization
CREATE INDEX idx_sales_text_public 
ON lootaura_v2.sales USING GIN (
  to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || address)
) WHERE status = 'published';

-- Owner-based queries
CREATE INDEX idx_sales_owner_created 
ON lootaura_v2.sales (owner_id, created_at DESC) 
WHERE owner_id IS NOT NULL;

-- Composite spatial + date
CREATE INDEX idx_sales_spatial_date 
ON lootaura_v2.sales (lat, lng, date_start, status) 
WHERE lat IS NOT NULL AND lng IS NOT NULL AND status = 'published';
```

#### RLS Performance Indexes
```sql
-- RLS policy optimization
CREATE INDEX idx_sales_rls_owner_status 
ON lootaura_v2.sales (owner_id, status) 
WHERE status = 'published';

CREATE INDEX idx_profiles_rls_id 
ON lootaura_v2.profiles (id);

CREATE INDEX idx_favorites_rls_user_id 
ON lootaura_v2.favorites (user_id);

CREATE INDEX idx_items_rls_sale_id 
ON lootaura_v2.items (sale_id);
```

#### Items Table Indexes
```sql
-- Category filtering
CREATE INDEX idx_items_category_sale_id 
ON lootaura_v2.items (category, sale_id) 
WHERE category IS NOT NULL;

-- Sales relationship optimization
CREATE INDEX idx_items_sales_join 
ON lootaura_v2.items (sale_id, id);
```

### Index Usage Monitoring

#### Performance Monitoring Functions
```sql
-- Query performance statistics
CREATE OR REPLACE FUNCTION get_query_performance_stats()
RETURNS TABLE (
  query_pattern TEXT,
  avg_execution_time_ms NUMERIC,
  total_calls BIGINT,
  last_executed TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'spatial_search'::TEXT as query_pattern,
    ROUND(AVG(mean_time), 2) as avg_execution_time_ms,
    SUM(calls) as total_calls,
    MAX(last_exec) as last_executed
  FROM pg_stat_statements 
  WHERE query LIKE '%search_sales_within_distance%'
  
  UNION ALL
  
  SELECT 
    'category_filter'::TEXT as query_pattern,
    ROUND(AVG(mean_time), 2) as avg_execution_time_ms,
    SUM(calls) as total_calls,
    MAX(last_exec) as last_executed
  FROM pg_stat_statements 
  WHERE query LIKE '%items%category%'
  
  UNION ALL
  
  SELECT 
    'date_filter'::TEXT as query_pattern,
    ROUND(AVG(mean_time), 2) as avg_execution_time_ms,
    SUM(calls) as total_calls,
    MAX(last_exec) as last_executed
  FROM pg_stat_statements 
  WHERE query LIKE '%date_start%' OR query LIKE '%date_end%';
END;
$$ LANGUAGE plpgsql;

-- Index usage statistics
CREATE OR REPLACE FUNCTION get_index_usage_stats()
RETURNS TABLE (
  table_name TEXT,
  index_name TEXT,
  index_scans BIGINT,
  tuples_read BIGINT,
  tuples_fetched BIGINT,
  index_size TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    schemaname||'.'||tablename as table_name,
    indexname as index_name,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
  FROM pg_stat_user_indexes 
  WHERE schemaname = 'lootaura_v2'
  ORDER BY idx_scan DESC;
END;
$$ LANGUAGE plpgsql;
```

## Query Optimization Strategies

### 1. Spatial Queries
```sql
-- Optimized spatial search with proper indexing
SELECT id, title, address, lat, lng, 
       ST_Distance(geom, ST_Point($1, $2)::geography) as distance
FROM lootaura_v2.sales 
WHERE status = 'published' 
  AND ST_DWithin(geom, ST_Point($1, $2)::geography, $3)
ORDER BY distance
LIMIT 50;
```

### 2. Category Filtering
```sql
-- Efficient category filtering with join optimization
SELECT DISTINCT s.id, s.title, s.address, s.lat, s.lng
FROM lootaura_v2.sales s
INNER JOIN lootaura_v2.items i ON s.id = i.sale_id
WHERE s.status = 'published'
  AND i.category = ANY($1)
  AND s.date_start >= $2
  AND s.date_end <= $3
ORDER BY s.created_at DESC;
```

### 3. Text Search
```sql
-- Full-text search with ranking
SELECT id, title, description, address,
       ts_rank(to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || address), 
               plainto_tsquery('english', $1)) as rank
FROM lootaura_v2.sales 
WHERE status = 'published'
  AND to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || address) 
      @@ plainto_tsquery('english', $1)
ORDER BY rank DESC, created_at DESC
LIMIT 20;
```

## Performance Monitoring Implementation

### 1. Database Connection Pooling
```typescript
// Supabase connection configuration
const supabaseConfig = {
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  }
}
```

### 2. Query Performance Tracking
```typescript
// Performance monitoring in API routes
const startTime = Date.now()

// ... database operation

const duration = Date.now() - startTime
if (duration > 1000) {
  authDebug.logPerformance('slow-query', startTime, {
    endpoint: '/api/sales',
    duration,
    query: 'spatial-search'
  })
}
```

### 3. Real-time Performance Metrics
```typescript
// Performance monitoring dashboard
interface PerformanceMetrics {
  database: {
    connectionPool: number
    queryTime: number
    slowQueries: number
  }
  api: {
    responseTime: number
    errorRate: number
    throughput: number
  }
  memory: {
    heapUsed: number
    heapTotal: number
    external: number
  }
}
```

## Monitoring Tools & Dashboards

### 1. Database Monitoring
- **pg_stat_statements**: Query performance tracking
- **pg_stat_user_indexes**: Index usage monitoring
- **pg_stat_user_tables**: Table access patterns
- **pg_stat_activity**: Connection monitoring

### 2. Application Monitoring
- **Debug Dashboard**: Real-time performance metrics
- **Console Logging**: Performance event tracking
- **Error Tracking**: Performance-related errors
- **Memory Monitoring**: Heap usage tracking

### 3. Performance Alerts
```typescript
// Performance threshold monitoring
const performanceThresholds = {
  database: {
    queryTime: 1000, // 1 second
    connectionPool: 0.8, // 80% utilization
  },
  api: {
    responseTime: 500, // 500ms
    errorRate: 0.05, // 5% error rate
  },
  memory: {
    heapUsed: 0.8, // 80% heap usage
  }
}
```

## Optimization Recommendations

### 1. Index Optimization
- **Monitor Index Usage**: Regularly check `pg_stat_user_indexes`
- **Remove Unused Indexes**: Drop indexes with low scan counts
- **Add Missing Indexes**: Create indexes for slow queries
- **Optimize Index Size**: Use partial indexes where appropriate

### 2. Query Optimization
- **Use EXPLAIN ANALYZE**: Analyze query execution plans
- **Optimize JOINs**: Use appropriate join types and conditions
- **Limit Result Sets**: Use LIMIT and OFFSET efficiently
- **Cache Results**: Implement query result caching

### 3. Connection Management
- **Connection Pooling**: Use appropriate pool sizes
- **Connection Timeouts**: Set reasonable timeout values
- **Connection Monitoring**: Track connection usage patterns
- **Connection Cleanup**: Properly close unused connections

### 4. Memory Management
- **Query Memory Limits**: Set appropriate work_mem values
- **Buffer Pool Size**: Optimize shared_buffers
- **Cache Configuration**: Configure effective caching
- **Memory Monitoring**: Track memory usage patterns

## Performance Testing

### 1. Load Testing
```bash
# Database load testing
pgbench -c 10 -j 2 -T 60 -f spatial_queries.sql

# API load testing
k6 run --vus 10 --duration 30s api_load_test.js
```

### 2. Performance Benchmarks
```sql
-- Spatial query benchmark
EXPLAIN ANALYZE
SELECT id, title, ST_Distance(geom, ST_Point(-84.3880, 33.7490)::geography) as distance
FROM lootaura_v2.sales 
WHERE status = 'published' 
  AND ST_DWithin(geom, ST_Point(-84.3880, 33.7490)::geography, 10000)
ORDER BY distance
LIMIT 50;
```

### 3. Index Effectiveness Testing
```sql
-- Test index usage
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM lootaura_v2.sales 
WHERE status = 'published' 
  AND date_start >= '2024-01-01' 
  AND date_end <= '2024-12-31';
```

## Maintenance Procedures

### 1. Regular Maintenance
```sql
-- Update table statistics
ANALYZE lootaura_v2.sales;
ANALYZE lootaura_v2.profiles;
ANALYZE lootaura_v2.favorites;
ANALYZE lootaura_v2.items;

-- Vacuum tables
VACUUM ANALYZE lootaura_v2.sales;
VACUUM ANALYZE lootaura_v2.profiles;
```

### 2. Performance Monitoring
```sql
-- Check slow queries
SELECT query, mean_time, calls, total_time
FROM pg_stat_statements 
WHERE mean_time > 1000
ORDER BY mean_time DESC;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes 
WHERE schemaname = 'lootaura_v2'
ORDER BY idx_scan DESC;
```

### 3. Performance Optimization
```sql
-- Identify unused indexes
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes 
WHERE schemaname = 'lootaura_v2' 
  AND idx_scan = 0;

-- Check table bloat
SELECT schemaname, tablename, 
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
       pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size
FROM pg_tables 
WHERE schemaname = 'lootaura_v2';
```

## Future Optimizations

### 1. Advanced Indexing
- **Partial Indexes**: For frequently filtered columns
- **Expression Indexes**: For computed columns
- **Covering Indexes**: Include frequently accessed columns
- **Hash Indexes**: For equality comparisons

### 2. Query Optimization
- **Materialized Views**: For complex aggregations
- **Query Rewriting**: Optimize common query patterns
- **Parallel Queries**: Utilize multiple CPU cores
- **Query Caching**: Cache frequently executed queries

### 3. Infrastructure Optimization
- **Read Replicas**: Distribute read load
- **Connection Pooling**: Advanced pooling strategies
- **Caching Layers**: Redis/Memcached integration
- **CDN Integration**: Static asset optimization

## Performance Metrics Dashboard

### Key Metrics to Monitor
1. **Database Performance**
   - Query execution time
   - Connection pool utilization
   - Index usage statistics
   - Slow query identification

2. **Application Performance**
   - API response times
   - Error rates
   - Throughput metrics
   - Memory usage

3. **User Experience**
   - Page load times
   - Time to interactive
   - First contentful paint
   - Cumulative layout shift

### Alerting Thresholds
- **Critical**: Query time > 5 seconds
- **Warning**: Query time > 1 second
- **Info**: Query time > 500ms
- **Memory**: Heap usage > 80%
- **Connections**: Pool utilization > 90%

This comprehensive performance monitoring system ensures optimal database performance and application responsiveness while providing the tools necessary for ongoing optimization and maintenance.
