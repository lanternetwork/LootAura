(function () {
  const LOOTAURA_EXTERNAL_PAGE_QUEUE_INIT = "__lootauraExternalPageQueue_v2";
  if (globalThis[LOOTAURA_EXTERNAL_PAGE_QUEUE_INIT]) {
    return;
  }
  globalThis[LOOTAURA_EXTERNAL_PAGE_QUEUE_INIT] = true;

  const SESSION_KEY = "lootaura_queue_session";
const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign"];
const OVERLAY_ID = "lootaura-phase2-overlay";

function canonicalizeUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    u.hash = "";
    TRACKING_PARAMS.forEach((p) => u.searchParams.delete(p));

    let path = u.pathname;
    if (path.endsWith("/")) path = path.slice(0, -1);

    const query = u.searchParams.toString();
    return u.origin + path + (query ? "?" + query : "");
  } catch {
    return url;
  }
}

function buildQueueUrls() {
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const urls = anchors
    .map((a) => {
      try {
        return new URL(a.getAttribute("href"), window.location.origin).href;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const listingUrls = urls.filter((url) => {
    const u = url.toLowerCase();
    return u.includes("/listing.html") || u.includes("/userlisting.html");
  });

  const unique = Array.from(new Set(listingUrls));

  console.log("Total anchors:", anchors.length);
  console.log("Listing URLs found:", unique.length);
  console.log("Sample URLs:", unique.slice(0, 5));

  return unique;
}

function deriveCityStateFromPage() {
  const parts = window.location.pathname
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));

  let state = "";
  let city = "";
  for (let i = 0; i < parts.length; i += 1) {
    if (/^[A-Za-z]{2}$/.test(parts[i])) {
      state = parts[i].toUpperCase();
      if (parts[i + 1]) {
        city = parts[i + 1].replace(/-/g, " ").trim();
      }
      break;
    }
  }

  if (!city) {
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    const cityPrompt = prompt("Enter city for this session (required):", "");
    city = (cityPrompt || "").trim();
  }

  if (!state) {
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    const statePrompt = prompt("Enter state code (required, e.g. IL):", "");
    state = (statePrompt || "").trim().toUpperCase();
  }

  if (!city || !state) return null;
  return { city, state };
}

function createSession(urls, locationInfo) {
  return {
    id: Date.now().toString(),
    source: "external_page_source",
    urls,
    city: locationInfo.city,
    state: locationInfo.state,
    currentIndex: 0,
    processedUrls: [],
    failedUrls: [],
    createdAt: Date.now(),
    version: 1,
  };
}

function saveSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SESSION_KEY]: session }, () => resolve());
  });
}

function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SESSION_KEY, (res) => resolve(res[SESSION_KEY] || null));
  });
}

const RUNTIME_MESSAGE_TIMEOUT_MS = 120000;

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          "Timed out waiting for the extension background (preflight). Reload this tab, ensure the LootAura extension is enabled, open your LootAura preview tab while logged in as admin, then try again."
        )
      );
    }, RUNTIME_MESSAGE_TIMEOUT_MS);

    chrome.runtime.sendMessage(message, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response ?? null);
    });
  });
}

async function runPreflight() {
  try {
    const result = await sendRuntimeMessage({
      type: "PREFLIGHT_UPLOAD",
      payload: { records: [] },
    });
    return result || { ok: false, status: 0, error: "No preflight response" };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function startSession() {
  const urls = buildQueueUrls();
  if (urls.length === 0) {
    alert("No listings found on this page (no listing or userlisting URLs in links).");
    return;
  }
  if (urls.length < 3) {
    console.warn(
      "[LootAura] Few listing URLs on this page:",
      urls.length,
      "(expected more on a typical city results page)"
    );
  }

  const locationInfo = deriveCityStateFromPage();
  if (!locationInfo) {
    alert("City and state are required to start session.");
    return;
  }

  const preflight = await runPreflight();
  const status = Number(preflight?.status || 0);
  if (!preflight?.ok) {
    if (status === 401 || status === 403) {
      alert("You must be logged in as admin in LootAura.");
    } else if (String(preflight?.error || "").toLowerCase().includes("csrf")) {
      alert("Missing CSRF token in LootAura tab.");
    } else if (status === 429) {
      alert("Preflight rate-limited after retries. Try again shortly.");
    } else {
      const detail =
        (preflight && typeof preflight.error === "string" && preflight.error) ||
        (status ? `HTTP ${status}` : "");
      alert(
        detail
          ? `Preflight failed. Session not started.\n\n${detail}`
          : "Preflight failed. Session not started."
      );
    }
    console.warn("[LootAura] Preflight failed:", preflight);
    return;
  }

  const session = createSession(urls, locationInfo);
  await saveSession(session);
  console.log("[LootAura] Session created:", {
    id: session.id,
    queueSize: session.urls.length,
    city: session.city,
    state: session.state,
    currentIndex: session.currentIndex,
  });

  console.log("[LootAura] Navigation triggered:", session.urls[0]);
  window.location = session.urls[0];
}

async function resumeSessionIfActive() {
  const session = await getSession();
  if (!session) return;

  if (
    !Array.isArray(session.urls) ||
    session.urls.length === 0 ||
    !Number.isInteger(session.currentIndex) ||
    session.currentIndex < 0 ||
    session.currentIndex >= session.urls.length
  ) {
    console.warn("[LootAura] Invalid session, clearing");
    chrome.storage.local.remove(SESSION_KEY);
    return;
  }

  const index = session.currentIndex;
  const current = canonicalizeUrl(window.location.href);
  const target = canonicalizeUrl(session.urls[index]);
  if (current !== target) return;

  const processedUrls = Array.isArray(session.processedUrls) ? session.processedUrls : [];
  const failedUrls = Array.isArray(session.failedUrls) ? session.failedUrls : [];
  if (processedUrls.includes(current)) return;
  if (failedUrls.some((f) => f && f.url === current)) return;

  console.log("[LootAura] Resume detected. Session active:", index);
  renderOverlay(session, current);
}

function createOverlayRoot() {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.style.position = "fixed";
  root.style.top = "12px";
  root.style.right = "12px";
  root.style.width = "240px";
  root.style.background = "#111";
  root.style.color = "#fff";
  root.style.border = "1px solid #333";
  root.style.borderRadius = "8px";
  root.style.padding = "12px";
  root.style.zIndex = "2147483647";
  root.style.fontFamily = "Arial, sans-serif";
  root.style.boxShadow = "0 6px 18px rgba(0, 0, 0, 0.4)";
  return root;
}

function saveSessionAndNavigate(session) {
  chrome.storage.local.set({ [SESSION_KEY]: session }, () => {
    console.log("[LootAura] Session updated:", {
      currentIndex: session.currentIndex,
      processed: (session.processedUrls || []).length,
      failed: (session.failedUrls || []).length,
    });
    goToNext(session);
  });
}

function goToNext(session) {
  if (session.currentIndex >= session.urls.length) {
    alert("Session complete");
    chrome.storage.local.remove(SESSION_KEY);
    return;
  }

  const nextUrl = session.urls[session.currentIndex];
  console.log("[LootAura] Navigation triggered:", nextUrl);
  window.location = nextUrl;
}

function extractTitle() {
  const heading = document.querySelector("h1");
  return heading?.textContent?.trim() || document.title || "";
}

function extractDescription() {
  const contentEls = Array.from(document.querySelectorAll(".content"));
  const description = contentEls
    .map((el) => (el instanceof HTMLElement ? el.innerText : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  console.log("EXTRACTED DESCRIPTION:", description);
  return description;
}

/** US-style street + city + state on one line; no heuristic fallback. */
function extractAddress() {
  const lines = (document.body.innerText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const pattern =
    /\d{3,6}\s+[A-Za-z0-9.\-\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?/i;
  const line = lines.find((l) => pattern.test(l)) ?? null;

  const addressRaw = line ? line.slice(0, 500) : null;
  console.log("Address extracted:", addressRaw);
  return addressRaw;
}

/** City + 2-letter state at end of line: `City, ST`, `City, ST ZIP`, or `City, ST ZIP, USA`. */
function extractCityState(address) {
  if (!address) return { city: null, state: null };

  const match = address.match(
    /,\s*([^,]+?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*USA)?$/i
  );

  if (!match) return { city: null, state: null };

  return {
    city: match[1].trim(),
    state: match[2].toUpperCase(),
  };
}

function extractDate() {
  const text = document.body.innerText || "";
  const line = text
    .split("\n")
    .find((entry) => /\b(\d{1,2}\/\d{1,2}\/\d{2,4}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(entry));
  return line ? line.trim().slice(0, 200) : "";
}

function extractImage() {
  const img = document.querySelector("img");
  const src = img?.getAttribute("src");
  if (!src) return null;
  try {
    return new URL(src, window.location.origin).toString();
  } catch {
    return null;
  }
}

function buildSubmissionPayload(session, currentUrl, selectedTags) {
  const addressRaw = extractAddress();
  const { city, state } = extractCityState(addressRaw);
  console.log("City/state extracted:", { city, state });

  return {
    records: [
      {
        sourcePlatform: "external_page_source",
        sourceUrl: currentUrl,
        externalId: null,
        title: extractTitle(),
        description: extractDescription(),
        addressRaw,
        dateRaw: extractDate(),
        imageSourceUrl: extractImage(),
        cityHint: city || session.city,
        stateHint: state || session.state,
        rawPayload: {
          tags: selectedTags,
          collectedAt: Date.now(),
        },
      },
    ],
  };
}

function renderOverlay(session, currentUrl) {
  const root = createOverlayRoot();
  const title = document.createElement("div");
  title.textContent = "LootAura";
  title.style.fontWeight = "700";
  title.style.fontSize = "16px";
  title.style.marginBottom = "8px";

  const progress = document.createElement("div");
  progress.textContent = `Sale ${session.currentIndex + 1} / ${session.urls.length}`;
  progress.style.fontSize = "13px";
  progress.style.marginBottom = "10px";

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.marginBottom = "10px";

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.textContent = "Submit";
  submitBtn.style.flex = "1";
  submitBtn.style.padding = "6px 8px";
  submitBtn.style.border = "1px solid #444";
  submitBtn.style.borderRadius = "6px";
  submitBtn.style.background = "#1f7a35";
  submitBtn.style.color = "#fff";
  submitBtn.style.cursor = "pointer";
  submitBtn.setAttribute("aria-label", "Submit current listing");

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.textContent = "Skip";
  skipBtn.style.flex = "1";
  skipBtn.style.padding = "6px 8px";
  skipBtn.style.border = "1px solid #444";
  skipBtn.style.borderRadius = "6px";
  skipBtn.style.background = "#6a6a6a";
  skipBtn.style.color = "#fff";
  skipBtn.style.cursor = "pointer";
  skipBtn.setAttribute("aria-label", "Skip current listing");
  controls.appendChild(submitBtn);
  controls.appendChild(skipBtn);

  const tagsTitle = document.createElement("div");
  tagsTitle.textContent = "Tags:";
  tagsTitle.style.fontSize = "12px";
  tagsTitle.style.marginBottom = "6px";

  const tags = ["Multi-family", "Furniture", "Tools", "Estate sale"];
  const tagsWrap = document.createElement("div");
  tagsWrap.style.display = "grid";
  tagsWrap.style.gap = "4px";
  tags.forEach((tag) => {
    const label = document.createElement("label");
    label.style.fontSize = "12px";
    label.style.display = "flex";
    label.style.gap = "6px";
    label.style.alignItems = "center";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("data-tag", tag.toLowerCase());

    const text = document.createElement("span");
    text.textContent = tag;
    label.appendChild(input);
    label.appendChild(text);
    tagsWrap.appendChild(label);
  });

  function disableButtons() {
    submitBtn.disabled = true;
    skipBtn.disabled = true;
    submitBtn.style.opacity = "0.7";
    skipBtn.style.opacity = "0.7";
    submitBtn.style.cursor = "not-allowed";
    skipBtn.style.cursor = "not-allowed";
  }

  function enableButtons() {
    submitBtn.disabled = false;
    skipBtn.disabled = false;
    submitBtn.style.opacity = "1";
    skipBtn.style.opacity = "1";
    submitBtn.style.cursor = "pointer";
    skipBtn.style.cursor = "pointer";
  }

  submitBtn.addEventListener("click", () => {
    disableButtons();
    console.log("[LootAura] Submit clicked:", currentUrl);

    const selectedTags = Array.from(tagsWrap.querySelectorAll("input[type='checkbox']"))
      .filter((el) => el.checked)
      .map((el) => el.getAttribute("data-tag") || "")
      .filter(Boolean);
    const payload = buildSubmissionPayload(session, currentUrl, selectedTags);
    console.log("[LootAura] Payload built:", payload);

    try {
      chrome.runtime.sendMessage({ type: "SUBMIT_SALE", payload }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("[LootAura] Submit transport failed:", chrome.runtime.lastError.message);
          enableButtons();
          return;
        }
        console.log("[LootAura] Submission response status:", response?.status);
      });
    } catch (error) {
      console.error("[LootAura] Submit transport exception:", error);
      enableButtons();
      return;
    }

    if (!Array.isArray(session.processedUrls)) session.processedUrls = [];
    if (!session.processedUrls.includes(currentUrl)) {
      session.processedUrls.push(currentUrl);
    }
    session.currentIndex += 1;
    saveSessionAndNavigate(session);
  });

  skipBtn.addEventListener("click", () => {
    disableButtons();
    console.log("[LootAura] Skip clicked:", currentUrl);

    if (!Array.isArray(session.failedUrls)) session.failedUrls = [];
    if (!session.failedUrls.some((f) => f && f.url === currentUrl)) {
      session.failedUrls.push({ url: currentUrl, reason: "manual_skip" });
    }

    session.currentIndex += 1;
    saveSessionAndNavigate(session);
  });

  root.appendChild(title);
  root.appendChild(progress);
  root.appendChild(controls);
  root.appendChild(tagsTitle);
  root.appendChild(tagsWrap);
  document.body.appendChild(root);
  console.log("[LootAura] Overlay rendered for listing:", currentUrl);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "START_SESSION") {
    // Popup uses chrome.tabs.sendMessage; must ack or the port closes with an error.
    try {
      sendResponse({ ok: true });
    } catch {
      /* ignore */
    }
    void startSession().catch((err) => {
      console.error("[LootAura] startSession failed:", err);
      window.alert(
        err instanceof Error ? `LootAura: ${err.message}` : `LootAura: ${String(err)}`
      );
    });
    return false;
  }
  return false;
});

resumeSessionIfActive();
})();

