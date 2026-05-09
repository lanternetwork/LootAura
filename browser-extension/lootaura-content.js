(function () {
  const guard = "__lootauraIngestionBridge_v1";
  if (globalThis[guard]) return;
  globalThis[guard] = true;

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )csrf-token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function parseRetryAfterFromResponse(res, jsonFallback) {
    let retryAfterSec = null;
    const retryHdr = res.headers.get("Retry-After");
    if (retryHdr != null && retryHdr !== "") {
      const n = parseInt(retryHdr, 10);
      if (Number.isFinite(n)) retryAfterSec = n;
    }
    if (res.status === 429 && retryAfterSec == null && jsonFallback && typeof jsonFallback.retryAfterSec === "number") {
      retryAfterSec = Math.max(1, Math.floor(jsonFallback.retryAfterSec));
    }
    return retryAfterSec;
  }

  /**
   * Keep in sync with lib/extension/manualUploadPersistenceAck.ts
   */
  function evaluateManualUploadPersistenceAck(status, body) {
    if (status !== 200) return { ok: false, reason: "bad_status" };
    if (!body || typeof body !== "object") return { ok: false, reason: "no_body" };
    if (body.ok !== true) return { ok: false, reason: "body_not_ok" };
    const summary = body.summary;
    if (!summary || typeof summary !== "object") return { ok: false, reason: "no_summary" };
    const created = Number(summary.created);
    const updated = Number(summary.updated);
    const failed = Number(summary.failed);
    const c = Number.isFinite(created) ? created : 0;
    const u = Number.isFinite(updated) ? updated : 0;
    const f = Number.isFinite(failed) ? failed : 0;
    if (f !== 0) return { ok: false, reason: "failed_records" };
    if (c + u <= 0) return { ok: false, reason: "no_persistence" };
    return { ok: true, reason: "ok" };
  }

  async function tryParseJson(res) {
    try {
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /** Auth/capability check: GET admin list (no upload body, no CSRF). */
  async function runPreflightCapability() {
    try {
      const res = await fetch("/api/admin/ingested-sales/list?limit=1", {
        method: "GET",
        credentials: "include",
      });

      const body = await tryParseJson(res);
      const retryAfterSec = parseRetryAfterFromResponse(res, body || {});

      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: res.status, error: "Admin auth failed" };
      }
      if (res.status === 429) {
        return {
          ok: false,
          status: 429,
          error: "Rate limited",
          ...(typeof retryAfterSec === "number" ? { retryAfterSec } : {}),
        };
      }
      if (res.status >= 500) {
        return {
          ok: false,
          status: res.status,
          error: body && body.message ? String(body.message) : `Server error (${res.status})`,
        };
      }
      if (res.status !== 200 || !body || body.ok !== true) {
        return {
          ok: false,
          status: res.status,
          error:
            (body && (body.message || body.error)) ||
            (res.status === 400 ? "Bad request" : `HTTP ${res.status}`),
        };
      }

      return { ok: true, status: 200 };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function runManualUpload(payload) {
    const csrf = getCsrfToken();
    if (!csrf) {
      return { ok: false, status: 0, error: "Missing CSRF token", ackReason: "missing_csrf" };
    }

    try {
      const res = await fetch("/api/admin/ingested-sales/upload", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify(payload),
      });

      const body = await tryParseJson(res);
      const retryAfterSec = parseRetryAfterFromResponse(res, body || {});

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          error: "Admin access or CSRF failed",
          ackReason: "auth",
        };
      }

      if (res.status === 429) {
        return {
          ok: false,
          status: 429,
          error: "Rate limited",
          ...(typeof retryAfterSec === "number" ? { retryAfterSec } : {}),
          ackReason: "rate_limit",
        };
      }

      if (res.status === 400) {
        const detail =
          body && Array.isArray(body.details)
            ? JSON.stringify(body.details).slice(0, 500)
            : body && body.error
              ? String(body.error)
              : "Invalid upload payload";
        return {
          ok: false,
          status: 400,
          error: detail,
          body,
          ackReason: "validation",
        };
      }

      if (res.status >= 500) {
        return {
          ok: false,
          status: res.status,
          error: body && body.error ? String(body.error) : `Server error (${res.status})`,
          body,
          ackReason: "server",
        };
      }

      if (res.status !== 200) {
        return {
          ok: false,
          status: res.status,
          error:
            (body && (body.error || body.message)) ||
            `Unexpected HTTP ${res.status}`,
          body,
          ackReason: "http",
        };
      }

      const evalResult = evaluateManualUploadPersistenceAck(res.status, body);
      const persistenceOk = evalResult.ok;

      const out = {
        ok: persistenceOk,
        status: res.status,
        ackReason: evalResult.reason,
        ...(body ? { body } : {}),
        ...(body && body.summary ? { summary: body.summary } : {}),
      };

      if (!persistenceOk) {
        let msg = "Upload did not persist.";
        if (evalResult.reason === "no_persistence") {
          msg = "Upload returned success but no rows were created or updated.";
        } else if (evalResult.reason === "failed_records") {
          msg = "Upload completed with failures (summary.failed > 0).";
        } else if (evalResult.reason === "no_summary" || evalResult.reason === "body_not_ok") {
          msg = "Upload response missing ok/summary; persistence not confirmed.";
        }
        return {
          ...out,
          error: msg,
        };
      }

      return out;
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
        ackReason: "network",
      };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || (msg.type !== "PREFLIGHT_CHECK" && msg.type !== "PROCESS_SUBMISSION")) {
      try {
        sendResponse({ ok: false, error: "Unknown message type" });
      } catch {
        /* ignore */
      }
      return false;
    }

    (async () => {
      try {
        if (msg.type === "PREFLIGHT_CHECK") {
          sendResponse(await runPreflightCapability());
          return;
        }

        sendResponse(await runManualUpload(msg.payload));
      } catch (e) {
        sendResponse({
          ok: false,
          status: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    return true;
  });
})();
