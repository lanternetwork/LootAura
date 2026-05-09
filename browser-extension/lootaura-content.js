(function () {
  const guard = "__lootauraIngestionBridge_v1";
  if (globalThis[guard]) return;
  globalThis[guard] = true;

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )csrf-token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /** Parse JSON from any response; non-JSON becomes a small diagnostic object. */
  async function parseResponseBody(res) {
    const text = await res.text();
    if (!text || !String(text).trim()) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { _nonJson: true, _textPreview: String(text).slice(0, 2000) };
    }
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

  function serverFieldsFromBody(body, status) {
    const code =
      body && typeof body.code === "string"
        ? body.code
        : status === 401
          ? "UPLOAD_AUTH_UNAUTHORIZED"
          : status === 403
            ? "UPLOAD_AUTH_FORBIDDEN"
            : undefined;
    const message =
      body && typeof body.message === "string"
        ? body.message
        : body && typeof body.error === "string"
          ? body.error
          : undefined;
    return { serverCode: code, serverMessage: message };
  }

  /** Auth/capability check: GET admin list (no upload body, no CSRF). */
  async function runPreflightCapability() {
    try {
      const res = await fetch("/api/admin/ingested-sales/list?limit=1", {
        method: "GET",
        credentials: "include",
      });

      const responseBody = await parseResponseBody(res);
      const retryAfterSec = parseRetryAfterFromResponse(res, responseBody || {});

      if (res.status === 401 || res.status === 403) {
        const { serverCode, serverMessage } = serverFieldsFromBody(responseBody, res.status);
        return {
          ok: false,
          status: res.status,
          error: serverMessage || "Admin auth failed",
          serverCode,
          serverMessage,
          responseBody,
        };
      }
      if (res.status === 429) {
        return {
          ok: false,
          status: 429,
          error: "Rate limited",
          ...(typeof retryAfterSec === "number" ? { retryAfterSec } : {}),
          responseBody,
        };
      }
      if (res.status >= 500) {
        return {
          ok: false,
          status: res.status,
          error:
            (responseBody && (responseBody.message || responseBody.error)) ||
            `Server error (${res.status})`,
          responseBody,
        };
      }
      if (res.status !== 200 || !responseBody || responseBody.ok !== true) {
        const { serverCode, serverMessage } = serverFieldsFromBody(responseBody, res.status);
        return {
          ok: false,
          status: res.status,
          error:
            serverMessage ||
            (responseBody && responseBody.message) ||
            (res.status === 400 ? "Bad request" : `HTTP ${res.status}`),
          serverCode,
          serverMessage,
          responseBody,
        };
      }

      return { ok: true, status: 200, responseBody };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
        responseBody: null,
      };
    }
  }

  async function runManualUpload(payload) {
    const csrf = getCsrfToken();
    if (!csrf) {
      return {
        ok: false,
        status: 0,
        error: "Missing CSRF token",
        ackReason: "missing_csrf",
        responseBody: null,
        serverCode: "UPLOAD_CLIENT_MISSING_CSRF",
        serverMessage: "csrf-token cookie not found in LootAura tab",
      };
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

      const responseBody = await parseResponseBody(res);
      const retryAfterSec = parseRetryAfterFromResponse(res, responseBody || {});
      const { serverCode, serverMessage } = serverFieldsFromBody(responseBody, res.status);

      const rid =
        responseBody && typeof responseBody.requestId === "string" ? responseBody.requestId : undefined;

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          status: res.status,
          error: serverMessage || "Admin access or CSRF failed",
          ackReason: "auth",
          serverCode,
          serverMessage,
          requestId: rid,
          responseBody,
        };
      }

      if (res.status === 429) {
        return {
          ok: false,
          status: 429,
          error: "Rate limited",
          ...(typeof retryAfterSec === "number" ? { retryAfterSec } : {}),
          ackReason: "rate_limit",
          serverCode: responseBody && responseBody.code ? String(responseBody.code) : "RATE_LIMITED",
          serverMessage: responseBody && responseBody.message ? String(responseBody.message) : undefined,
          requestId: rid,
          responseBody,
        };
      }

      if (res.status === 400) {
        const detail =
          serverMessage ||
          (responseBody && Array.isArray(responseBody.details)
            ? JSON.stringify(responseBody.details).slice(0, 800)
            : responseBody && responseBody.error
              ? String(responseBody.error)
              : "Invalid upload payload");
        return {
          ok: false,
          status: 400,
          error: detail,
          ackReason: "validation",
          serverCode: serverCode || "UPLOAD_VALIDATION_FAILED",
          serverMessage: serverMessage || detail,
          requestId: rid,
          responseBody,
        };
      }

      if (res.status === 422) {
        const msg =
          serverMessage ||
          (responseBody && responseBody.message) ||
          "Upload did not persist rows.";
        return {
          ok: false,
          status: 422,
          error: msg,
          ackReason: "no_persistence_server",
          serverCode: serverCode || "UPLOAD_ZERO_OR_PARTIAL",
          serverMessage: msg,
          summary: responseBody && responseBody.summary ? responseBody.summary : undefined,
          requestId: rid,
          ingestionRunId:
            responseBody && typeof responseBody.ingestionRunId === "string"
              ? responseBody.ingestionRunId
              : undefined,
          responseBody,
        };
      }

      if (res.status >= 500) {
        const msg =
          serverMessage ||
          (responseBody && responseBody.message) ||
          (responseBody && responseBody.error) ||
          `Server error (${res.status})`;
        return {
          ok: false,
          status: res.status,
          error: msg,
          ackReason: "server",
          serverCode,
          serverMessage: msg,
          requestId: rid,
          responseBody,
        };
      }

      if (res.status !== 200) {
        const msg =
          serverMessage ||
          (responseBody && (responseBody.error || responseBody.message)) ||
          `Unexpected HTTP ${res.status}`;
        return {
          ok: false,
          status: res.status,
          error: msg,
          ackReason: "http",
          serverCode,
          serverMessage: msg,
          requestId: rid,
          responseBody,
        };
      }

      const evalResult = evaluateManualUploadPersistenceAck(res.status, responseBody);
      const persistenceOk = evalResult.ok;

      const out = {
        ok: persistenceOk,
        status: res.status,
        ackReason: evalResult.reason,
        serverCode: responseBody && responseBody.code ? String(responseBody.code) : undefined,
        serverMessage: undefined,
        summary: responseBody && responseBody.summary ? responseBody.summary : undefined,
        ingestionRunId:
          responseBody && typeof responseBody.ingestionRunId === "string"
            ? responseBody.ingestionRunId
            : undefined,
        requestId:
          responseBody && typeof responseBody.requestId === "string"
            ? responseBody.requestId
            : undefined,
        responseBody,
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
          serverMessage: msg,
        };
      }

      return out;
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
        ackReason: "network",
        responseBody: null,
        serverCode: "UPLOAD_CLIENT_NETWORK",
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
          responseBody: null,
        });
      }
    })();

    return true;
  });
})();
