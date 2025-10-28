## Viewport Fetching Architecture

This document describes the debounced viewport-based fetching pipeline used by the map, including debounce modes, abort/cancel behavior, retry expectations, and test invariants.

### Components

- `createViewportFetchManager(options)` in `lib/map/viewportFetchManager.ts`
  - Options:
    - `debounceMs`: number (default 300)
    - `debounceMode`: `'trailing' | 'leading' | 'leading-trailing'` (default `'trailing'`)
    - `schedule(fn, ms)`: scheduler function (defaults to `setTimeout`), DI surface for tests
    - `fetcher(viewport, filters, signal)`: async function that performs the request
    - `controllerFactory()`: returns `AbortController` (defaults to `new AbortController()`), DI surface for tests
    - `onAbort(reason)`, `onStart()`, `onResolve(result)`: hooks for observability
  - API:
    - `request(viewport, filters)`: enqueue a request according to the debounce mode
    - `getStats()`: `{ started, aborted, resolved }` internal counters
    - `dispose()`: cancels timers and aborts inflight requests

### Debounce Modes

- `trailing` (recommended default for viewport fetch):
  - No immediate call. A single call fires after `debounceMs` since the last request.
  - Multiple rapid `request()` calls collapse into one fetch.

- `leading`:
  - First call starts immediately when idle.
  - Subsequent calls within the debounce window are ignored until the window elapses.

- `leading-trailing`:
  - Start immediately on the first call (leading), and also schedule a trailing call after `debounceMs` reflecting the latest args.
  - If another request arrives, the trailing run replaces the previous one and aborts any inflight fetch.

### Abort and Cancellation

- Every started fetch is guarded by an `AbortController`:
  - New eligible starts will abort the previous inflight controller before starting.
  - Trailing runs replace inflight work (if any) and increment `aborted`.
  - `dispose()` aborts inflight and clears timers.

Observability hooks:
- `onStart()`: called when a fetch actually starts; increments `started`.
- `onResolve(result)`: called when the fetch resolves and is still current; increments `resolved`.
- `onAbort(reason)`: called when a previous inflight request is aborted or an error occurs before completion.

### Retry Expectations

- The fetch manager itself does not implement retry/backoff; consumers (or the provided `fetcher`) should implement retries if needed.
- Tests cover deterministic cancellation and resolution; retries are orthogonal and should respect the provided `AbortSignal`.

### Invariants (Tested)

We assert the following counters for correctness and determinism:

- `started`: number of actual fetch starts (after debounce). In `trailing`, a burst should yield `started = 1`.
- `aborted`: number of inflight fetches aborted due to replacement (`dispose()` also increments when it aborts inflight).
- `resolved`: number of successful completions that are still current at resolution time.

Examples used in tests (`tests/unit/map.debounce-manager.test.ts`):

- Trailing collapse (multiple rapid `request()`): after advancing timers, `started = 1`, `aborted = 0`, and resolving the deferred sets `resolved = 1`.
- Cancel/replace: additional requests before the trailing window end do not start new fetches in `trailing` mode; only the final scheduled fetch runs.
- Abort signal propagation: the `AbortSignal` passed to `fetcher` is aborted when a newer eligible run replaces it or when `dispose()` is called.

### Usage Notes

- Prefer `trailing` for viewport-driven fetching to reduce redundant network calls and ensure the latest viewport wins.
- Prefer `leading` or `leading-trailing` only when you need immediate feedback (e.g., optimistic previews) and a final stabilization run.
- Keep payloads small and idempotent where possible; aborted results must be considered non-authoritative by consumers.


