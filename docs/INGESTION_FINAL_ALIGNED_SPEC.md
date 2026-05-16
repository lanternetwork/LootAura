# LootAura Ingestion System - Final Aligned Specification (Locked)

## 1. Objective

Primary Goal:
Accept external sale data -> persist -> geocode -> transition through existing lifecycle -> publish -> make visible on map.

## 2. Definition of Done (DoD)

Ingestion is complete only when:
upload -> stored -> geocoded -> ready -> published -> visible on map

All of the following must be true:
- Row created in `ingested_sales`
- Row transitions from `needs_geocode` to next valid state
- Geocode completes successfully (`lat/lng` populated)
- Publish pipeline executes
- Row transitions to `published`
- `published_sale_id` is set
- Sale appears in map/list query path (`sales_v2` or equivalent)
- Queue processes jobs without loss
- Fallback path works without Redis

## 3. System Alignment Rules (Non-Negotiable)

### 3.1 Status Model - MUST NOT CHANGE
Use existing lifecycle exactly:
`needs_geocode -> needs_check -> ready -> published`

DO NOT:
- rename statuses
- introduce new status vocabulary
- add parallel status systems

### 3.2 No Parallel State Fields
DO NOT introduce:
- `geocode_status`

All state must be derived from existing `status` column.

### 3.3 Retry Behavior
Use existing retry configuration:
- `max_attempts = existing value` (for example 5)

DO NOT change retry limits unless explicitly required.

### 3.4 Cron Contract
Cron endpoints must:
- use existing HTTP method (likely GET)
- match existing deployment wiring

DO NOT change method signatures.

### 3.5 Queue Invariant (Critical)
At ANY loop exit:
- ALL unprocessed jobs MUST still exist in queue state

No silent drops. Ever.

## 4. Data Model

Table: `ingested_sales`

Use existing schema.

Required fields (already assumed to exist):
- id
- title
- address_raw
- city, state, zip
- lat, lng
- status
- published_sale_id

Status Lifecycle:
`needs_geocode -> needs_check -> ready -> published`
`                      -> failed` (if applicable)

Invariants:
- `lat/lng` must exist before reaching `ready`
- `published_sale_id` must exist when `published`
- transitions must be idempotent

## 5. Upload API

Endpoint:
`POST /api/admin/ingested-sales/upload`

Input:
Minimal validation only:

```json
{
  "sales": [
    {
      "title": "Garage Sale",
      "address": "123 Main St",
      "city": "Louisville",
      "state": "KY",
      "zip": "40202"
    }
  ]
}
```

Behavior:
- Step 1 Insert: `status = needs_geocode`
- Step 2 Trigger Processing:
  - IF Redis available: enqueue job
  - ELSE: run worker immediately (fallback)

Response:
`{ "ok": true, "count": N }`

## 6. Geocode Worker

File:
`lib/ingestion/geocodeWorker.ts`

Function:
`geocodeIngestedSaleById(saleId)`

Behavior:
1. Fetch row
2. If `status != needs_geocode` -> exit (idempotent)
3. Geocode address -> `lat/lng`
4. Update `lat/lng`
5. Transition status to next valid state (for example `needs_check` or `ready`)
6. Trigger publish pipeline

Idempotency Rule:
Worker must be safe to run multiple times:
- IF `lat/lng` exists OR status progressed -> no-op

Failure Handling:
- Retry via queue if transient
- Mark terminal failure using existing system behavior

## 7. Queue System

File:
`lib/ingestion/geocodeQueue.ts`

Job Shape:

```json
{
  "saleId": "string",
  "attempts": 0,
  "priority": "high | normal"
}
```

Core Operations:
- enqueue
- dequeueBatch
- requeue

Requirements:
- at-least-once processing
- no job loss
- retry with backoff
- high priority for extension-origin jobs

Critical Invariant:
- No loop exit may drop jobs

## 8. Retry Strategy

Use existing retry system:
- attempt < max -> requeue
- attempt >= max -> terminal failure

## 9. Upload -> Queue Bridge

- IF Redis: enqueue(job)
- ELSE: worker(saleId)

Guarantee:
- Queue failure MUST NOT block ingestion

## 10. Cron Processor

Endpoint:
`/api/cron/geocode`

(method must match existing system)

Behavior:
- jobs = dequeueBatch(N)
- FOR each job:
  - try worker
  - catch -> requeue

Constraints:
- batch limited
- short execution window
- no long-running loops

## 11. Publish Integration (Critical Path)

Trigger:
On successful geocode:
- status transition -> publish pipeline invoked

Requirements:
- must reuse existing publish system
- must be idempotent
- must work for:
  - queue path
  - fallback path

## 12. Map Visibility

Requirement:
Published sale must appear in:
- `sales_v2` (or equivalent public query layer)

Validation:
published row -> queryable -> visible in map/list endpoints

## 13. Fallback Mode

If Redis unavailable:
- Upload -> Worker -> Publish -> Visible

Guarantee:
- System always completes ingestion path

## 14. Minimal Required Tests

Validate only:
1. upload inserts rows
2. upload triggers processing
3. worker sets `lat/lng`
4. status transitions correctly
5. publish executes
6. map query returns record
7. queue does not lose jobs

## 15. Hard Scope Boundaries

MUST NOT TOUCH:
- global API error normalization
- auth/profile/share endpoints
- seller rating
- promotions
- logging refactors
- unrelated tests

ONLY TOUCH:
- ingestion worker
- ingestion queue
- upload route
- cron route
- publish trigger integration

## 16. System Principles

Idempotency:
- Safe to re-run any job.

Isolation:
- No dependency on unrelated systems.

Determinism:
- Same input -> same output.

Resilience:
- Queue failure != ingestion failure.

## 17. Final Acceptance Checklist

- [ ] Upload creates ingestion row
- [ ] Row transitions from `needs_geocode`
- [ ] `lat/lng` populated
- [ ] Publish triggered
- [ ] Row reaches `published`
- [ ] `published_sale_id` set
- [ ] Sale visible in map/list
- [ ] Queue has no job loss
- [ ] Fallback works without Redis
- [ ] CI green for ingestion scope

## Final Rule

If a change does not directly support:
`upload -> geocode -> publish -> map visibility`

it is out of scope and must be rejected.

