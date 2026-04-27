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

    return {
      ok: res.status === 200 || res.status === 400,
      status: res.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (!msg || (msg.type !== "PREFLIGHT_UPLOAD" && msg.type !== "PROCESS_SUBMISSION")) return;

    const result = await runUpload(msg.payload);

    if (msg.type === "PREFLIGHT_UPLOAD") {
      // Preflight-specific interpretation for caller.
      if (result.status === 401 || result.status === 403) {
        sendResponse({ ok: false, status: result.status, error: "Admin auth failed" });
        return;
      }
      if (result.status === 429) {
        sendResponse({ ok: false, status: 429, error: "Rate limited" });
        return;
      }
      sendResponse(result);
      return;
    }

    // Submission path: non-blocking status handoff.
    sendResponse(result);
  })();

  return true;
});

