# LootAura Migration Policy

**Last updated: 2025-10-13 — Enterprise Documentation Alignment**

This document defines the authoritative policy for database migrations to prevent schema drift and ensure system stability.

## Migration Requirements

### Required Components
Every migration must include:

1. **Migration ID**: Unique identifier (e.g., `036_add_user_preferences.sql`)
2. **Up Migration**: Forward migration script
3. **Down Migration**: Rollback script (optional but recommended)
4. **Post-Migration Verification**: SQL queries to verify migration success
5. **Documentation Update**: Update relevant documentation

### Migration Naming Convention
```
{sequence_number}_{description}.sql
```

Examples:
- `036_add_user_preferences.sql`
- `037_update_category_schema.sql`
- `038_add_performance_indexes.sql`

## Environment Application Order

### Development Environment
1. **Local Development**: Apply migrations to local Supabase instance
2. **Testing**: Run full test suite with new schema
3. **Verification**: Execute post-migration verification queries
4. **Documentation**: Update schema documentation

### Preview Environment
1. **Staging Deployment**: Apply migrations to preview Supabase instance
2. **Integration Testing**: Run integration tests with new schema
3. **Performance Testing**: Verify query performance with new indexes
4. **User Acceptance**: Test with preview deployment

### Production Environment
1. **Backup**: Create full database backup before migration
2. **Maintenance Window**: Apply during low-traffic period
3. **Verification**: Execute post-migration verification queries
4. **Monitoring**: Monitor system performance and error rates
5. **Rollback Plan**: Ready to execute rollback if issues arise

## Migration Verification Gate

### Pre-Migration Checks
- [ ] Migration script syntax validated
- [ ] Rollback script tested
- [ ] Dependencies verified (no circular dependencies)
- [ ] Performance impact assessed
- [ ] Documentation updated

### Post-Migration Verification
Every migration must include verification queries:

```sql
-- Example: Verify new column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'preferences';

-- Example: Verify index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'sales' AND indexname = 'idx_sales_category';

-- Example: Verify RLS policy exists
SELECT policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'users' AND policyname = 'users_select_own';
```

### Verification Checklist
- [ ] All new columns exist with correct data types
- [ ] All new indexes are created and functional
- [ ] All RLS policies are active and correct
- [ ] All foreign key constraints are properly set
- [ ] All triggers are created and functional
- [ ] Performance queries execute within expected time
- [ ] No orphaned data or broken references

## Migration Safety Guidelines

### Backward Compatibility
- **Column Additions**: New columns should be nullable or have defaults
- **Column Removals**: Deprecate columns before removal
- **Schema Changes**: Maintain API compatibility during transition
- **Data Migration**: Ensure all existing data is preserved

### Performance Considerations
- **Index Creation**: Create indexes concurrently to avoid locks
- **Large Tables**: Use batch processing for large data migrations
- **Query Performance**: Test query performance before and after
- **Resource Usage**: Monitor CPU and memory usage during migration

### Rollback Strategy
- **Immediate Rollback**: Ability to rollback within 5 minutes
- **Data Preservation**: No data loss during rollback
- **Service Continuity**: Minimal service interruption
- **Testing**: Rollback procedure tested in staging

## Migration Documentation

### Required Documentation
Each migration must update:

1. **Schema Documentation**: Update `docs/INVARIANTS.md` if schema changes
2. **API Documentation**: Update API docs if endpoints change
3. **Test Documentation**: Update test matrix if behavior changes
4. **Deployment Documentation**: Update deployment procedures

### Documentation Template
```markdown
## Migration: {migration_id}

### Purpose
Brief description of what this migration accomplishes.

### Changes
- Added column: `users.preferences` (JSONB)
- Created index: `idx_sales_category` on `sales.category`
- Updated RLS policy: `users_select_own`

### Verification
```sql
-- Verification queries here
```

### Rollback
```sql
-- Rollback script here
```

### Performance Impact
- Query performance: +15% improvement on category filters
- Storage impact: +2MB for new column
- Index size: 1.2MB for new index
```

## Migration Testing

### Unit Tests
- **Schema Tests**: Verify new schema elements exist
- **Data Tests**: Verify data integrity after migration
- **Performance Tests**: Verify query performance improvements
- **Rollback Tests**: Verify rollback procedure works

### Integration Tests
- **API Tests**: Verify API endpoints work with new schema
- **Application Tests**: Verify application functionality
- **Performance Tests**: Verify overall system performance
- **Security Tests**: Verify RLS policies work correctly

### E2E Tests
- **User Workflows**: Verify critical user paths work
- **Data Operations**: Verify CRUD operations work
- **Performance**: Verify system performance under load
- **Error Handling**: Verify error handling with new schema

## Migration Monitoring

### Pre-Migration Monitoring
- **Database Size**: Record current database size
- **Query Performance**: Baseline query performance
- **Error Rates**: Current error rates
- **User Activity**: Current user activity levels

### During Migration Monitoring
- **Migration Progress**: Monitor migration execution
- **Resource Usage**: Monitor CPU, memory, disk usage
- **Lock Contention**: Monitor for lock contention
- **Error Rates**: Monitor for increased error rates

### Post-Migration Monitoring
- **Query Performance**: Verify query performance improvements
- **Error Rates**: Ensure error rates haven't increased
- **User Experience**: Monitor user experience metrics
- **System Health**: Monitor overall system health

## Emergency Procedures

### Migration Failure
1. **Immediate**: Stop migration execution
2. **Assessment**: Assess impact and data integrity
3. **Rollback**: Execute rollback procedure if needed
4. **Communication**: Notify team of issues
5. **Investigation**: Investigate root cause
6. **Fix**: Fix issues before retry

### Data Corruption
1. **Immediate**: Stop all database operations
2. **Assessment**: Assess extent of corruption
3. **Restore**: Restore from backup if needed
4. **Verification**: Verify data integrity
5. **Communication**: Notify stakeholders
6. **Prevention**: Implement measures to prevent recurrence

### Performance Degradation
1. **Immediate**: Monitor system performance
2. **Assessment**: Identify performance bottlenecks
3. **Optimization**: Apply performance optimizations
4. **Monitoring**: Continue monitoring performance
5. **Documentation**: Document lessons learned

## Migration Checklist

### Pre-Migration
- [ ] Migration script reviewed and approved
- [ ] Rollback procedure tested
- [ ] Backup created
- [ ] Monitoring in place
- [ ] Team notified
- [ ] Documentation updated

### During Migration
- [ ] Migration executed successfully
- [ ] No errors during execution
- [ ] Performance within acceptable limits
- [ ] All verification queries pass
- [ ] System functionality verified

### Post-Migration
- [ ] All verification queries pass
- [ ] Performance improved or maintained
- [ ] No data corruption
- [ ] System functionality verified
- [ ] Documentation updated
- [ ] Team notified of success

## Migration Tools

### Supabase CLI
```bash
# Generate migration
supabase migration new add_user_preferences

# Apply migration
supabase db push

# Reset database
supabase db reset
```

### Custom Scripts
```bash
# Verify migration status
npm run verify:migrations

# Test migration
npm run test:migrations

# Rollback migration
npm run rollback:migrations
```

## Migration Best Practices

### Development
- **Small Changes**: Keep migrations small and focused
- **Testing**: Test migrations thoroughly before applying
- **Documentation**: Document all changes clearly
- **Review**: Have migrations reviewed by team

### Production
- **Backup**: Always backup before migration
- **Monitoring**: Monitor system during migration
- **Rollback**: Have rollback plan ready
- **Communication**: Keep team informed of progress

### Maintenance
- **Cleanup**: Remove old migrations when no longer needed
- **Optimization**: Optimize migrations for performance
- **Documentation**: Keep documentation up to date
- **Training**: Train team on migration procedures

---

**This migration policy ensures database stability and prevents schema drift while maintaining system reliability.**
