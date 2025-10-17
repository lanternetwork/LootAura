# Bugfix Sprint Board

Columns: Backlog → Repro’d → Fix in Progress → Ready for Review → Done

Guidelines:
- Minimal fixes only, no refactors; add/adjust tests first.
- Keep CI green; no skipped tests; no CI/workflow changes.
- Use NEXT_PUBLIC_DEBUG-gated logs only; remove before finalizing.

## Backlog

- [BF-001] Map/List sync: ensure identical filters applied to markers and list
  - Repro: change category filters; list updates but marker set diverges
  - Expected: markers and list reflect the same filtered dataset
  - Affected: `components/YardSaleMap.tsx`, `components/SalesList.tsx`, filter selectors
  - Proposed: centralize derived filter object passed to both queries; add integration test

- [BF-002] AddSale form: tags add/remove edge cases
  - Repro: add tag with trailing spaces; remove last tag; rapid add/remove
  - Expected: tags normalize, appear/disappear reliably; no duplicate tags
  - Affected: `components/AddSaleForm.tsx`
  - Proposed: trim/lowercase on add; dedupe set; test keyboard/enter/remove

- [BF-003] Grid layout columns misreport at certain widths
  - Repro: resize around breakpoint; data-columns lags expected value
  - Expected: data-columns matches computed columns; one `grid-cols-*` class
  - Affected: `components/SalesGrid.tsx`
  - Proposed: debounce or ensure ResizeObserver callback updates synchronously in tests; verify with test

- [BF-004] Image upload: pending/failed states not surfaced
  - Repro: simulate slow upload / error; CTA and aria states not updated
  - Expected: visible loading/disabled state; error message role=alert
  - Affected: `components/ImageUploader.tsx`
  - Proposed: minimal state guard + aria; test success/error UI

## Repro’d

_(empty)_

## Fix in Progress

_(empty)_

## Ready for Review

_(empty)_

## Done

_(empty)_

---

CI delta log:
- Use this section to note which CI jobs failed after each bug and the first failing line; keep brief.


