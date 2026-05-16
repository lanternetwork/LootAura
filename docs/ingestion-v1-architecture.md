# Ingestion System v1 Architecture Note

This note captures locked implementation decisions for the LootAura ingestion system.

## Locked Decisions

1. Ingestion publishes into `lootaura_v2.sales`.
2. External data first lands in `ingested_sales`.
3. Published imported sales are owned by a real system user via `INGESTED_SALES_OWNER_ID`.
4. Admin access uses existing admin controls:
   - `ADMIN_EMAILS`
   - `assertAdminOrThrow`
5. Cron access uses existing cron auth patterns:
   - `/api/cron/*`
   - `assertCronAuthorized`
   - `CRON_SECRET`
6. Source ingestion is adapter-based.
7. MVP adapters are:
   - `external_page_source`
   - `manual_upload`
8. Page-based source ingestion uses explicit configured page lists only.
9. No dynamic crawling, no map simulation, and no automated browsing behavior.
10. Manual upload is a first-class fallback path.
11. All inputs run through the same pipeline:
    - normalize
    - parse
    - geocode
    - validate
    - dedupe
    - stage
    - publish if ready
12. Publishing must go through a shared internal publish service, not a one-off direct insert path.
13. Publishing uses service-role/admin DB access.
14. Admin mutating routes require CSRF protection.
15. Times must be normalized to existing sales constraints, including 30-minute granularity.
16. Scheduling is city-timezone aware using city config.
17. Imported records must never bypass validation or dedupe.

## Implementation Conventions to Preserve

- Keep write paths aligned with schema-scoped base-table usage (`lootaura_v2.*`) and avoid write-through view behavior.
- Reuse existing auth helpers and route conventions rather than introducing parallel auth patterns.
- Preserve non-blocking, fail-closed behavior for ingestion state transitions (invalid/ambiguous records must stay staged).

