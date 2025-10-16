# Legacy Cut Summary

## Removed Paths ✅
- **Property Pulse Integration** (Complete removal - zero references)
  - `app-property-pulse/` - External template app routes
  - `components-property-pulse/` - External template components  
  - `config-property-pulse/` - External template configuration
  - `context-property-pulse/` - External template context
  - `models-property-pulse/` - External template models
  - `utils-property-pulse/` - External template utilities

- **Legacy Development Routes** (Complete removal - zero references)
  - `app/(legacy)/` - Legacy app routes
  - `app/admin/` - Admin development tools
  - `app/debug/` - Debug development tools
  - `app/debug-tables/` - Debug table tools
  - `app/test-*/` - Test development routes
  - `app/api/admin/` - Admin API endpoints
  - `app/api/debug/` - Debug API endpoints
  - `app/api/debug-tables/` - Debug table API
  - `app/api/test-*/` - Test API endpoints
  - `components/debug/` - Debug development components
  - `lib/admin/` - Admin development utilities

- **Legacy Configuration Files** (Complete removal)
  - `env.legacy.example` - Legacy environment template
  - `check_db_state.sql` - Legacy database check
  - `db_snapshot.sql` - Legacy database snapshot
  - `simple_db_check.sql` - Legacy database check

## Deferred Paths (None)
All legacy paths had zero inbound references from active code, so no paths were deferred.

## CI Scope Now ✅
**Included Roots:**
- `app/sales/` - Core sales functionality
- `app/(app)/` - Main app routes  
- `app/api/sales/` - Sales API endpoints
- `app/api/health/` - Health check endpoint
- `components/` - Core components (excluding debug)
- `lib/` - Core library code (excluding admin)
- `tests/` - Test suite

**Excluded Patterns:**
- `app-property-pulse/**` - Removed
- `components-property-pulse/**` - Removed
- `config-property-pulse/**` - Removed
- `context-property-pulse/**` - Removed
- `models-property-pulse/**` - Removed
- `utils-property-pulse/**` - Removed
- `app/admin/**` - Removed
- `app/debug/**` - Removed
- `app/test-*/**` - Removed
- `app/api/admin/**` - Removed
- `app/api/debug/**` - Removed
- `app/api/test-*/**` - Removed
- `components/debug/**` - Removed
- `lib/admin/**` - Removed

## Rollback Plan ✅
**Safety Branch:** `ops/legacy-cut-snapshot`
- Contains complete snapshot before legacy cut
- Can restore any removed paths via cherry-pick
- Command: `git cherry-pick <commit-hash>` for specific files
- Command: `git checkout ops/legacy-cut-snapshot -- <path>` for specific paths

## Impact Assessment ✅
- **Files Removed:** 128 files
- **Lines Removed:** ~10,000 lines
- **Bundle Size Reduction:** Significant (removed entire external template)
- **CI Focus:** Now targets only active milestone code
- **No Breaking Changes:** All removed code had zero active references

## Next Steps
1. ✅ CI should now run faster with focused scope
2. ✅ Lint/typecheck should only process active code
3. ✅ Tests should only run against active codebase
4. ✅ Build should be cleaner without legacy dependencies
