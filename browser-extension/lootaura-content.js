(function () {
  const guard = "__lootauraIngestionBridge_v1";
  if (globalThis[guard]) return;
  globalThis[guard] = true;

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|; )csrf-token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  async function runUpload(payload) {
    const csrf = getCsrfToken();
    if (!csrf) {
      return { ok: false, status: 0, error: "Missing CSRF token" };
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

      let retryAfterSec = null;
      const retryHdr = res.headers.get("Retry-After");
      if (retryHdr != null && retryHdr !== "") {
        const n = parseInt(retryHdr, 10);
        if (Number.isFinite(n)) retryAfterSec = n;
      }
      if (res.status === 429 && retryAfterSec == null) {
        try {
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            const data = await res.clone().json();
            if (data && typeof data.retryAfterSec === "number" && Number.isFinite(data.retryAfterSec)) {
              retryAfterSec = Math.max(1, Math.floor(data.retryAfterSec));
            }
          }
        } catch {
          /* ignore */
        }
      }

      const base = {
        ok: res.status === 200 || res.status === 400,
        status: res.status,
      };
      return retryAfterSec != null ? { ...base, retryAfterSec } : base;
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || (msg.type !== "PREFLIGHT_UPLOAD" && msg.type !== "PROCESS_SUBMISSION")) {
      try {
        sendResponse({ ok: false, error: "Unknown message type" });
      } catch {
        /* ignore */
      }
      return false;
    }

    (async () => {
      try {
        const result = await runUpload(msg.payload);

        if (msg.type === "PREFLIGHT_UPLOAD") {
          if (result.status === 401 || result.status === 403) {
            sendResponse({ ok: false, status: result.status, error: "Admin auth failed" });
            return;
          }
          if (result.status === 429) {
            sendResponse({
              ok: false,
              status: 429,
              error: "Rate limited",
              ...(typeof result.retryAfterSec === "number"
                ? { retryAfterSec: result.retryAfterSec }
                : {}),
            });
            return;
          }
          sendResponse(result);
          return;
        }

        sendResponse(result);
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
