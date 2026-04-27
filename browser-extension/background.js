const LOOTAURA_ORIGIN = "https://lootaura.com";
const MAX_PREFLIGHT_ATTEMPTS = 3;
const PREFLIGHT_BACKOFF_MS = [1000, 2000, 5000];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queryLootAuraTabs() {
  return new Promise((resolve) => {
    chrome.tabs.query(
      { url: [`${LOOTAURA_ORIGIN}/*`, "https://www.lootaura.com/*"] },
      (tabs) => resolve(Array.isArray(tabs) ? tabs : [])
    );
  });
}

function createLootAuraTab() {
  return new Promise((resolve) => {
    chrome.tabs.create({ url: LOOTAURA_ORIGIN }, (tab) => resolve(tab || null));
  });
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timed out waiting for LootAura tab to load"));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId) return;
      if (changeInfo.status !== "complete") return;
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
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

function sendToLootAuraTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response || null);
    });
  });
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
  (async () => {
    if (!msg || (msg.type !== "PREFLIGHT_UPLOAD" && msg.type !== "SUBMIT_SALE")) return;

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

