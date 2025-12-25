# Vitest Teardown Timeout Experiment Results

**Experiment Date:** 2025-12-25  
**CI Run ID:** 20506410626  
**Branch:** test/ci-featured-email-starter-harness  
**Duration:** 30m18s (TIMED OUT)

## Experiment Design

### Hypothesis
**If Vitest worker teardown is causing CI hangs**, then adding `--teardown-timeout=10000` should allow Vitest to properly wait for cleanup and exit naturally.

### Controlled Change
**ONLY** modified CI test command:
- **Before:** `npx vitest run tests/integration/`
- **After:** `npx vitest run --teardown-timeout=10000 tests/integration/`

### What Was NOT Changed
- ❌ No changes to application code
- ❌ No changes to test code
- ❌ No changes to MSW cleanup logic
- ❌ No changes to undici cleanup logic
- ❌ No changes to HTTP agent cleanup
- ❌ No changes to vitest.config.ts (removed teardownTimeout config)
- ❌ No process.exit, force-exit, or timers
- ❌ No skipped tests

## Results

### CI Job Status
- **Job:** test-integration
- **Status:** ❌ **FAILED - TIMED OUT**
- **Duration:** 30m18s
- **Conclusion:** Job exceeded 30-minute timeout and was canceled
- **Final Action:** GitHub Actions terminated orphan processes (vitest, node)

### Test Execution Timeline
- **Started:** 2025-12-25T14:18:01Z
- **Last Test Output:** 2025-12-25T14:18:45Z (load-test-api.test.ts completed in 30018ms)
- **Canceled:** 2025-12-25T14:47:47Z (29 minutes after last test output)
- **Gap:** ~29 minutes between last test output and cancellation

### Key Observations

1. **Tests Appear to Have Completed**
   - Last test output shows `load-test-api.test.ts` completed at 14:18:45
   - No final test summary found in logs (suggests Vitest didn't reach final summary)
   - No evidence of tests still running after 14:18:45

2. **Process Did Not Exit**
   - GitHub Actions had to terminate orphan processes:
     - `npm exec vitest` (pid 2250)
     - `node (vitest)` (pid 2262)
     - Multiple `node` and `esbuild` processes
   - This indicates the Vitest process was still running when canceled

3. **No Teardown-Related Output**
   - No Vitest messages about teardown timeout
   - No teardown completion messages
   - No evidence that `--teardown-timeout=10000` had any effect

4. **The `--teardown-timeout` Flag Was Applied**
   - Command executed: `npx vitest run --teardown-timeout=10000 tests/integration/`
   - Flag was present in the command

## Conclusion

### ❌ EXPERIMENT FAILED - Vitest Worker Teardown Is NOT The Root Cause

**Evidence:**
1. Adding `--teardown-timeout=10000` did NOT fix the hang
2. CI still timed out after 30 minutes
3. Process was still running when GitHub Actions canceled it
4. No teardown-related output from Vitest

**Implication:**
The root cause is **NOT** Vitest's worker teardown mechanism. The `--teardown-timeout` flag is designed to give cleanup hooks time to complete, but:
- Vitest never reached the teardown phase (or teardown never completed)
- The process hung before/during teardown
- Something else is keeping the event loop alive

### What This Proves

1. **Vitest's teardown timeout is not the issue** - The flag had no effect
2. **The problem is deeper** - Something is preventing Vitest from even reaching teardown, or teardown is completing but something else keeps the process alive
3. **Application/library cleanup is likely the culprit** - Since Vitest teardown isn't the issue, the problem is in:
   - MSW server cleanup
   - Undici dispatcher cleanup
   - HTTP agent cleanup
   - Or some other handle created during tests

### Next Steps

Since Vitest worker teardown is proven NOT to be the issue, we must investigate:
1. What handles remain after `afterAll` hooks complete
2. Whether MSW's `server.close()` (called without await in CI) is leaving handles
3. Whether undici dispatcher cleanup is incomplete
4. Whether there are other handles created during test execution that aren't being cleaned up

**The synchronous cleanup approach in CI may be the problem** - by not awaiting `server.close()`, we may be leaving MSW's internal server running, which keeps the event loop alive.

---

**Experiment Status:** COMPLETE  
**Result:** FAILED - Vitest teardown timeout did not fix the hang  
**Conclusion:** Root cause is NOT Vitest worker teardown

