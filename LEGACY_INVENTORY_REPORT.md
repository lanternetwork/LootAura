# Legacy Inventory Report

## Phase 0 — Safety Net
- **Safety Branch**: `ops/legacy-cut-snapshot` (created and pushed)
- **Current Branch**: `milestone/auth-profile`

## Legacy Candidates for Removal/Exclusion

### 1. Property Pulse Integration (Complete Legacy)
| Path | Why Legacy | Last Commit | Import Count |
|------|------------|-------------|--------------|
| `app-property-pulse/` | External template integration, not part of core app | 2025-10-02 | TBD |
| `components-property-pulse/` | External template components | 2025-10-02 | TBD |
| `config-property-pulse/` | External template config | 2025-10-02 | TBD |
| `context-property-pulse/` | External template context | 2025-10-02 | TBD |
| `models-property-pulse/` | External template models | 2025-10-02 | TBD |
| `utils-property-pulse/` | External template utilities | 2025-10-02 | TBD |

### 2. Development/Testing Routes (Legacy)
| Path | Why Legacy | Last Commit | Import Count |
|------|------------|-------------|--------------|
| `app/(legacy)/` | Legacy app routes | 2025-10-02 | TBD |
| `app/admin/` | Admin development tools | 2025-10-12 | TBD |
| `app/debug/` | Debug development tools | 2025-10-01 | TBD |
| `app/debug-tables/` | Debug table tools | 2025-10-12 | TBD |
| `app/test-*/` | Test development routes | 2025-10-02 | TBD |
| `app/api/admin/` | Admin API endpoints | 2025-10-12 | TBD |
| `app/api/debug/` | Debug API endpoints | 2025-10-13 | TBD |
| `app/api/debug-tables/` | Debug table API | 2025-10-12 | TBD |
| `app/api/test-*/` | Test API endpoints | 2025-10-12 | TBD |

### 3. Development Components (Legacy)
| Path | Why Legacy | Last Commit | Import Count |
|------|------------|-------------|--------------|
| `components/debug/` | Debug development components | 2025-10-13 | TBD |
| `components/AdminTools.tsx` | Admin development tools | TBD | TBD |
| `components/DiagnosticOverlay.tsx` | Debug diagnostic tools | TBD | TBD |
| `components/GridDebugOverlay.tsx` | Debug grid tools | TBD | TBD |
| `components/GridLayoutDiagnostic.tsx` | Debug layout tools | TBD | TBD |
| `components/LayoutDiagnostic.tsx` | Debug layout tools | TBD | TBD |

### 4. Development Library Code (Legacy)
| Path | Why Legacy | Last Commit | Import Count |
|------|------------|-------------|--------------|
| `lib/admin/` | Admin development utilities | 2025-10-04 | TBD |

### 5. Legacy Configuration Files
| Path | Why Legacy | Last Commit | Import Count |
|------|------------|-------------|--------------|
| `env.legacy.example` | Legacy environment template | TBD | TBD |
| `check_db_state.sql` | Legacy database check | TBD | TBD |
| `db_snapshot.sql` | Legacy database snapshot | TBD | TBD |
| `simple_db_check.sql` | Legacy database check | TBD | TBD |

## Active Milestone Code (Keep)
- `app/sales/` - Core sales functionality
- `app/(app)/` - Main app routes
- `app/api/sales/` - Sales API endpoints
- `app/api/health/` - Health check endpoint
- `components/SaleCard.tsx` - Core sale components
- `components/SalesList.tsx` - Core sales list
- `components/SalesGrid.tsx` - Core sales grid
- `components/YardSaleMap.tsx` - Core map component
- `components/filters/` - Filter components
- `components/location/` - Location components
- `lib/hooks/` - Core hooks
- `lib/supabase/` - Database client
- `lib/shared/` - Shared utilities
- `tests/` - Test suite

## Next Steps
1. Run import graph scan to determine actual import counts
2. Identify candidates with zero imports for immediate removal
3. Mark candidates with active imports as "defer delete" and exclude from CI
4. Tighten CI scope to focus only on active milestone code
