const LOOTAURA_ORIGIN =
  "https://loot-aura-aeqcppnnz-lanternetworks-projects.vercel.app";
const MAX_PREFLIGHT_ATTEMPTS = 3;
const PREFLIGHT_BACKOFF_MS = [1000, 2000, 5000];
/** Brief retries after programmatic inject (frame paint / SW timing). */
const SEND_MESSAGE_RETRIES = 12;
const SEND_MESSAGE_RETRY_MS = 150;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queryLootAuraTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query(
      { url: [`${LOOTAURA_ORIGIN}/*`] },
      (tabs) => resolve(Array.isArray(tabs) ? tabs : [])
    );
  });
}

function createLootAuraTab() {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: LOOTAURA_ORIGIN, active: true }, (tab) =>
      resolve(tab || null)
    );
  });
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for LootAura tab to load"));
    }, timeoutMs);

    function maybeFinish(url) {
      if (!url || !url.startsWith(LOOTAURA_ORIGIN)) return;
      if (url.startsWith("chrome-error://")) return;
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(updatedTabId, changeInfo, tab) {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== "complete") return;
      const direct = tab?.url;
      if (direct) {
        maybeFinish(direct);
        return;
      }
      chrome.tabs.get(tabId, (t) => {
        if (chrome.runtime.lastError) return;
        maybeFinish(t?.url || "");
      });
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ensureLootAuraTab() {
  const tabs = await queryLootAuraTabs();
  if (tabs.length > 0 && typeof tabs[0].id === "number") {
    return tabs[0];
  }

  const created = await createLootAuraTab();
  if (!created || typeof created.id !== "number") {
    throw new Error("Failed to create LootAura tab");
  }
  await waitForTabComplete(created.id);
  return created;
}

/**
 * Manifest content_scripts are unreliable on Next.js (race / navigations).
 * Inject the bridge immediately before messaging.
 */
async function injectLootAuraBridge(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["lootaura-content.js"],
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to inject LootAura bridge: ${detail}`);
  }
}

async function sendToLootAuraTab(tabId, message) {
  await injectLootAuraBridge(tabId);

  let lastErr = "Unknown error";
  for (let attempt = 1; attempt <= SEND_MESSAGE_RETRIES; attempt += 1) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (r) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(r ?? null);
        });
      });
      return response;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      const retryable =
        lastErr.includes("Could not establish connection") ||
        lastErr.includes("Receiving end does not exist");
      if (!retryable || attempt >= SEND_MESSAGE_RETRIES) {
        throw new Error(lastErr);
      }
      await delay(SEND_MESSAGE_RETRY_MS);
    }
  }

  throw new Error(lastErr);
}

async function runPreflightWithRetry(tabId, payload) {
  let attempt = 0;
  while (attempt < MAX_PREFLIGHT_ATTEMPTS) {
    attempt += 1;
    const response = await sendToLootAuraTab(tabId, {
      type: "PREFLIGHT_UPLOAD",
      payload,
      attempt,
    });

    const status = Number(response?.status || 0);
    if (response?.ok) return response;
    if (status !== 429) return response;

    const backoff = PREFLIGHT_BACKOFF_MS[attempt - 1] || PREFLIGHT_BACKOFF_MS[PREFLIGHT_BACKOFF_MS.length - 1];
    await delay(backoff);
  }

  return {
    ok: false,
    status: 429,
    error: "Rate limited after preflight retries",
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || (msg.type !== "PREFLIGHT_UPLOAD" && msg.type !== "SUBMIT_SALE")) {
    return false;
  }

  (async () => {
    try {
      const lootauraTab = await ensureLootAuraTab();
      if (typeof lootauraTab.id !== "number") {
        throw new Error("LootAura tab has no id");
      }

      console.log("[LootAura][BG] LootAura tab found/created:", lootauraTab.id);

      if (msg.type === "PREFLIGHT_UPLOAD") {
        const preflightResult = await runPreflightWithRetry(lootauraTab.id, msg.payload);
        sendResponse(preflightResult);
        return;
      }

      const submissionResult = await sendToLootAuraTab(lootauraTab.id, {
        type: "PROCESS_SUBMISSION",
        payload: msg.payload,
      });
      sendResponse(submissionResult);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true;
});

