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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isYstmRegistrableHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "yardsaletreasuremap.com" || host.endsWith(".yardsaletreasuremap.com");
}

/** True when href is a YSTM community sale page we queue (sale.php + communitysale + id-ish listing). */
function isYstmCommunitySalePhpQueueUrl(href) {
  try {
    const u = new URL(href);
    if (!isYstmRegistrableHost(u.hostname)) return false;
    if (!/\/sale\.php$/i.test(u.pathname)) return false;
    const cs = u.searchParams.get("communitysale");
    return Boolean(cs != null && String(cs).trim() !== "");
  } catch {
    return false;
  }
}

/** Same host/path/query shape as queue URLs; used on the detail page for address + city/state fallbacks. */
function isYstmCommunitySalePhpPage(href) {
  return isYstmCommunitySalePhpQueueUrl(href);
}

function isLegacyListingHtmlUrl(href) {
  const u = String(href || "").toLowerCase();
  return u.includes("/listing.html") || u.includes("/userlisting.html");
}

/** Queue discovery: legacy listing URLs (any host) OR YSTM sale.php?communitysale=… */
function shouldQueueYstmUrl(href) {
  if (isLegacyListingHtmlUrl(href)) return true;
  return isYstmCommunitySalePhpQueueUrl(href);
}

function isYstmListPage() {
  const host = String(window.location.hostname || "").toLowerCase();
  const isYstmHost =
    host === "yardsaletreasuremap.com" || host.endsWith(".yardsaletreasuremap.com");
  if (!isYstmHost) return false;
  const path = String(window.location.pathname || "").toLowerCase();
  return !path.includes("/listing.html") && !path.includes("/userlisting.html");
}

async function waitForDomIdle(idleMs = 500, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const start = Date.now();
    let idleTimer = null;
    let timeoutTimer = null;
    let observer = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (idleTimer) clearTimeout(idleTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (observer) observer.disconnect();
      resolve(Date.now() - start);
    };

    const scheduleIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, idleMs);
    };

    timeoutTimer = setTimeout(finish, timeoutMs);
    scheduleIdle();

    try {
      observer = new MutationObserver(() => {
        scheduleIdle();
      });
      observer.observe(document.body || document.documentElement, {
        subtree: true,
        childList: true,
        attributes: false,
        characterData: false,
      });
    } catch {
      finish();
    }
  });
}

async function materializeYstmListRows(options = {}) {
  if (!isYstmListPage()) return { enabled: false, passes: 0, elapsedMs: 0, heightDelta: 0 };
  const maxPasses = Number.isFinite(options.maxPasses) ? Math.max(1, Math.min(8, options.maxPasses)) : 5;
  const passDelayMs =
    Number.isFinite(options.passDelayMs) ? Math.max(80, Math.min(1200, options.passDelayMs)) : 240;
  const startY = window.scrollY || 0;
  const startHeight = Math.max(
    document.body?.scrollHeight || 0,
    document.documentElement?.scrollHeight || 0
  );
  const start = Date.now();
  let stablePasses = 0;
  let lastHeight = startHeight;
  let passes = 0;

  for (let i = 0; i < maxPasses; i++) {
    passes += 1;
    const targetHeight = Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0
    );
    window.scrollTo({ top: targetHeight, behavior: "auto" });
    await sleep(passDelayMs);

    const nextHeight = Math.max(
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0
    );
    if (nextHeight <= lastHeight) {
      stablePasses += 1;
      if (stablePasses >= 2) break;
    } else {
      stablePasses = 0;
    }
    lastHeight = nextHeight;
  }

  window.scrollTo({ top: startY, behavior: "auto" });
  await sleep(80);

  return {
    enabled: true,
    passes,
    elapsedMs: Date.now() - start,
    heightDelta: Math.max(0, lastHeight - startHeight),
  };
}

function buildQueueUrls() {
  const scanStart = Date.now();
  const anchors = Array.from(document.querySelectorAll("a[href]"));

  /** Temporary: trace Chicago / Griffith list rows without changing queue logic. */
  const DEBUG_QUEUE_HREF_MARKERS = ["griffith", "town-wide", "46319"];
  function debugQueueHrefMatchesMarker(s) {
    if (s == null || s === "") return false;
    const lower = String(s).toLowerCase();
    for (let i = 0; i < DEBUG_QUEUE_HREF_MARKERS.length; i++) {
      if (lower.includes(DEBUG_QUEUE_HREF_MARKERS[i])) return true;
    }
    return false;
  }
  for (let di = 0; di < anchors.length; di++) {
    const a = anchors[di];
    const rawHref = a.getAttribute("href");
    let resolvedHref = null;
    let resolveOk = false;
    try {
      resolvedHref = new URL(rawHref, window.location.origin).href;
      resolveOk = true;
    } catch {
      resolvedHref = null;
      resolveOk = false;
    }
    if (!debugQueueHrefMatchesMarker(rawHref) && !debugQueueHrefMatchesMarker(resolvedHref)) {
      continue;
    }
    let passedListingFilter = false;
    let exclusionReason = null;
    if (!resolveOk) {
      exclusionReason = "invalid_href";
    } else {
      passedListingFilter = shouldQueueYstmUrl(resolvedHref);
      if (!passedListingFilter) {
        exclusionReason = "not_queueable_sale_href";
      }
    }
    console.log("[LootAura][QueueDebug]", {
      rawHref,
      resolvedHref,
      passedListingFilter,
      exclusionReason,
    });
  }

  const resolvedUrls = anchors
    .map((a) => {
      try {
        return new URL(a.getAttribute("href"), window.location.origin).href;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const listingUrls = resolvedUrls.filter((url) => shouldQueueYstmUrl(url));
  const userListingHrefCount = resolvedUrls.filter((url) =>
    url.toLowerCase().includes("/userlisting.html")
  ).length;
  const listingHrefCount = resolvedUrls.filter((url) =>
    url.toLowerCase().includes("/listing.html")
  ).length;
  const salePhpCommunityHrefCount = resolvedUrls.filter((url) =>
    isYstmCommunitySalePhpQueueUrl(url)
  ).length;
  const skippedNonListingHrefs = resolvedUrls.filter((url) => !shouldQueueYstmUrl(url));

  const unique = Array.from(new Set(listingUrls));
  const duplicateCount = Math.max(0, listingUrls.length - unique.length);
  const diagnostics = {
    totalAnchors: anchors.length,
    listingHrefCount,
    userListingHrefCount,
    salePhpCommunityHrefCount,
    queuedCount: unique.length,
    duplicateCount,
    skippedNonListingHrefCount: skippedNonListingHrefs.length,
    sampleSkippedHrefs: Array.from(new Set(skippedNonListingHrefs)).slice(0, 10),
    scanDurationMs: Date.now() - scanStart,
  };

  console.log("[LootAura][QueueDiag] Scan summary:", diagnostics);
  console.log("[LootAura][QueueDiag] Sample queued URLs:", unique.slice(0, 5));

  return { urls: unique, diagnostics };
}

const STATE_NAME_TO_CODE = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

function toTitleCase(input) {
  return input
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normalizeStateFromName(stateName) {
  const normalized = String(stateName || "")
    .replace(/-/g, " ")
    .toLowerCase()
    .trim();
  return STATE_NAME_TO_CODE[normalized] || "";
}

function normalizeCityFromPathSegment(segment) {
  const cleaned = String(segment || "")
    .replace(/[?#].*$/, "")
    .replace(/\.(?:html?|php|aspx?)$/i, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return toTitleCase(cleaned);
}

function deriveCityStateFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl, window.location.origin);
    const parts = url.pathname
      .split("/")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => decodeURIComponent(p));
    const usIndex = parts.findIndex((p) => p.toUpperCase() === "US");
    if (usIndex >= 0 && parts[usIndex + 1] && parts[usIndex + 2]) {
      return {
        city: normalizeCityFromPathSegment(parts[usIndex + 2]),
        state: normalizeStateFromName(parts[usIndex + 1]),
      };
    }
  } catch {
    // Ignore malformed URL and fall through.
  }
  return { city: "", state: "" };
}

function isLikelyNonCityPathSegment(segment) {
  let s = String(segment || "");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  if (/^\d/.test(s)) return true;
  if (/see-?source/i.test(s)) return true;
  if (/address-after/i.test(s)) return true;
  if (s.length > 48) return true;
  return false;
}

function hubBaseSlugFromSegment(hubSegment) {
  return String(hubSegment || "").replace(/\.html?$/i, "");
}

function parseYstmListingPathForPayload(listingUrl) {
  try {
    const url = new URL(listingUrl, window.location.origin);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "US" || parts.length < 6) return null;
    const pathStateSegment = parts[1] || null;
    const seg2 = parts[2] || "";
    let hubSegment = null;
    let pathCitySlugRaw = null;
    let addressIdx;
    if (/\.html?$/i.test(seg2) && parts[3]) {
      hubSegment = seg2;
      const cand = parts[3];
      if (!isLikelyNonCityPathSegment(cand)) {
        pathCitySlugRaw = cand;
        addressIdx = 4;
      } else {
        pathCitySlugRaw = hubBaseSlugFromSegment(seg2);
        addressIdx = 3;
      }
    } else if (seg2) {
      pathCitySlugRaw = seg2;
      addressIdx = 3;
    } else return null;
    return {
      pathStateSegment,
      hubSegment,
      pathCitySlugRaw,
      addressSlugSegment: parts[addressIdx] || null,
    };
  } catch {
    return null;
  }
}

function extractAddressTailCityStateForAuthority(addressRaw) {
  if (!addressRaw) return { addressTailCity: "", addressTailState: "" };
  const match = String(addressRaw).match(
    /,\s*([^,]+?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*USA)?$/i
  );
  if (!match) return { addressTailCity: "", addressTailState: "" };
  return {
    addressTailCity: normalizeCityFromPathSegment(match[1].trim()),
    addressTailState: match[2].toUpperCase(),
  };
}

/** Same predicate as server `hasConcreteStreetLineBeforeAddressTail`. */
function hasConcreteStreetLineBeforeAddressTailJs(addressRaw) {
  const s = String(addressRaw || "").trim();
  if (!s) return false;
  const m = s.match(/,\s*([^,]+?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?(?:,\s*USA)?$/i);
  if (!m || typeof m.index !== "number" || m.index === 0) return false;
  const streetPart = s.slice(0, m.index).trim();
  return /^\s*\d+\s+.+/.test(streetPart);
}

/**
 * Mirrors server `resolveYstmListingCityAuthority` for upload payloads.
 * Keep behavior aligned with `tests/unit/ystmListingCityAuthority.test.ts` (Vitest).
 */
function resolveYstmListingCityAuthorityJs(listingUrl, addressRaw) {
  const tail = extractAddressTailCityStateForAuthority(addressRaw || "");
  const streetConcrete = hasConcreteStreetLineBeforeAddressTailJs(addressRaw || "");
  const parsed = parseYstmListingPathForPayload(listingUrl);
  if (!parsed) {
    const hasTail = Boolean(tail.addressTailCity && tail.addressTailState);
    return {
      isYstmPath: false,
      pathCitySlug: null,
      hubSegment: null,
      addressTailCity: tail.addressTailCity || null,
      cityConflict: false,
      streetConcrete,
      citySource: hasTail ? "address_tail" : "none",
      stateSource: hasTail ? "address_tail" : "none",
      resolvedCity: tail.addressTailCity || "",
      resolvedState: tail.addressTailState || "",
      urlMunicipalityNormalized: "",
      pathStateNormalized: "",
    };
  }
  const urlCity = normalizeCityFromPathSegment(parsed.pathCitySlugRaw || "");
  const urlState = normalizeStateFromName(parsed.pathStateSegment);
  const addrCity = tail.addressTailCity;
  const addrState = tail.addressTailState;
  const cityConflict = Boolean(
    urlCity && addrCity && urlCity.toLowerCase() !== addrCity.toLowerCase()
  );
  let resolvedCity = "";
  let resolvedState = "";
  let citySource = "none";
  let stateSource = "none";
  if (cityConflict && streetConcrete && addrCity && addrState) {
    resolvedCity = addrCity;
    resolvedState = addrState;
    citySource = "address_tail";
    stateSource = "address_tail";
  } else {
    resolvedCity = urlCity || addrCity || "";
    resolvedState = urlState || addrState || "";
    citySource = urlCity ? "listing_url" : addrCity ? "address_tail" : "none";
    stateSource = urlState ? "listing_url" : addrState ? "address_tail" : "none";
  }
  return {
    isYstmPath: true,
    pathCitySlug: parsed.pathCitySlugRaw,
    hubSegment: parsed.hubSegment,
    addressTailCity: addrCity || null,
    cityConflict,
    streetConcrete,
    citySource,
    stateSource,
    resolvedCity,
    resolvedState,
    urlMunicipalityNormalized: urlCity,
    pathStateNormalized: urlState,
  };
}

function deriveCityStateFromPage() {
  const parts = window.location.pathname
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));

  let state = "";
  let city = "";

  // External listing path pattern: /US/{StateName}/{CitySlug}/...
  // Example: /US/Illinois/Tinley-Park/...
  const usIndex = parts.findIndex((p) => p.toUpperCase() === "US");
  if (usIndex >= 0 && parts[usIndex + 1] && parts[usIndex + 2]) {
    state = normalizeStateFromName(parts[usIndex + 1]);
    city = normalizeCityFromPathSegment(parts[usIndex + 2]);
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
      type: "PREFLIGHT_CHECK",
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
  const domIdleMs = await waitForDomIdle(500, 4000);
  const materialization = await materializeYstmListRows({
    maxPasses: 5,
    passDelayMs: 240,
  });
  const postMaterializeIdleMs = await waitForDomIdle(450, 2500);
  const { urls, diagnostics } = buildQueueUrls();
  console.log("[LootAura][QueueDiag] Pre-scan timing/materialization:", {
    domIdleMs,
    postMaterializeIdleMs,
    materialization,
  });
  console.log("[LootAura][QueueDiag] Queue diagnostics:", diagnostics);
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
      const sec = preflight?.retryAfterSec;
      if (typeof sec === "number" && sec > 0) {
        alert(
          `Preflight rate-limited. Try again in about ${sec} second${sec === 1 ? "" : "s"}.`
        );
      } else {
        alert("Preflight rate-limited. Try again shortly.");
      }
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

/** --- YSTM / listing date extraction (mirrors server `externalPageSource` metadata precedence) --- */

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function epochSecondsToIsoDate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 946684800) return null;
  const d = new Date(value * 1000);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

function extractDateRangeFromText(text) {
  const year = new Date().getFullYear();
  function toIso(y, m, d) {
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  const range = text.match(/(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})/);
  if (range) {
    const m1 = parseInt(range[1], 10);
    const d1 = parseInt(range[2], 10);
    const m2 = parseInt(range[3], 10);
    const d2 = parseInt(range[4], 10);
    const start = toIso(year, m1, d1);
    const end = toIso(year, m2, d2);
    if (start && end) return { start, end };
  }

  const single = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (single) {
    const m = parseInt(single[1], 10);
    const d = parseInt(single[2], 10);
    let yy = year;
    if (single[3]) {
      const yPart = parseInt(single[3], 10);
      yy = single[3].length === 2 ? 2000 + yPart : yPart;
    }
    const iso = toIso(yy, m, d);
    if (iso) return { start: iso, end: iso };
  }

  const monthNames = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  const monthNameRegex =
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?/gi;
  const found = [];
  let mm;
  while ((mm = monthNameRegex.exec(text)) !== null) {
    const monKey = (mm[1] || "").toLowerCase().replace(/\.$/, "");
    const mon = monthNames[monKey];
    const day = parseInt(mm[2] || "", 10);
    const y = mm[3] ? parseInt(mm[3], 10) : year;
    const iso = mon ? toIso(y, mon, day) : null;
    if (iso && found.indexOf(iso) === -1) found.push(iso);
  }

  const compactMonthRange = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})(?:,\s*(\d{4}))?/i
  );
  if (compactMonthRange) {
    const monKey = (compactMonthRange[1] || "").toLowerCase().replace(/\.$/, "");
    const mon = monthNames[monKey];
    const d1 = parseInt(compactMonthRange[2] || "", 10);
    const d2 = parseInt(compactMonthRange[3] || "", 10);
    const y = compactMonthRange[4] ? parseInt(compactMonthRange[4], 10) : year;
    const start = mon ? toIso(y, mon, d1) : null;
    const end = mon ? toIso(y, mon, d2) : null;
    if (start && end) return { start, end };
  }
  if (found.length >= 2) return { start: found[0], end: found[1] };
  if (found.length === 1) return { start: found[0], end: found[0] };

  const isoPlain = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoPlain) {
    const iso = `${isoPlain[1]}-${isoPlain[2]}-${isoPlain[3]}`;
    return { start: iso, end: iso };
  }

  return {};
}

function decodeJsSingleQuotedJson(raw) {
  return String(raw)
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function parseMetadataDateValue(raw) {
  if (typeof raw === "number") return epochSecondsToIsoDate(raw);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{9,11}$/.test(trimmed)) {
    const epoch = parseInt(trimmed, 10);
    return epochSecondsToIsoDate(epoch);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  const extracted = extractDateRangeFromText(trimmed);
  return extracted.start || null;
}

function normalizeListingUrlForLookup(raw) {
  try {
    const u = new URL(String(raw).trim(), window.location.origin);
    u.hash = "";
    return u.href;
  } catch {
    return String(raw).trim();
  }
}

function externalIdFromListingUrl(url) {
  const m = String(url).match(/\/(\d+)\/(?:listing|userlisting)\.html/i);
  return m ? m[1] : null;
}

function metadataInfoFromSale(sale) {
  const url = typeof sale?.url === "string" ? normalizeListingUrlForLookup(sale.url) : null;
  if (!url) return null;
  const startFromFields = [sale?.date, sale?.start_date, sale?.startDate, sale?.date_start]
    .map(parseMetadataDateValue)
    .find(function (v) {
      return typeof v === "string" && v.length > 0;
    });
  const endFromFields = [sale?.end_date, sale?.endDate, sale?.date_end]
    .map(parseMetadataDateValue)
    .find(function (v) {
      return typeof v === "string" && v.length > 0;
    });
  const fromDescription =
    typeof sale?.description === "string" ? extractDateRangeFromText(sale.description) : {};
  const fromTitle = typeof sale?.title === "string" ? extractDateRangeFromText(sale.title) : {};
  let startDate = startFromFields || null;
  let endDate = endFromFields || null;
  if (!startDate && fromTitle.start) startDate = fromTitle.start;
  if (!endDate && fromTitle.end) endDate = fromTitle.end;
  if (!startDate && fromDescription.start) startDate = fromDescription.start;
  if (!endDate && fromDescription.end) endDate = fromDescription.end;
  if (!startDate && endDate) startDate = endDate;
  if (!endDate && startDate) endDate = startDate;
  if (!startDate && !endDate) return null;
  return { url, startDate, endDate };
}

function extractYstmMetadataSaleDates(pageUrl) {
  const normalizedHref = normalizeListingUrlForLookup(pageUrl);
  const canonicalHref = canonicalizeUrl(pageUrl);
  const externalId = externalIdFromListingUrl(pageUrl);
  const scripts = Array.from(document.querySelectorAll("script"));
  for (let s = 0; s < scripts.length; s++) {
    const text = scripts[s].textContent || "";
    const m = text.match(/metadataStr\s*=\s*'([\s\S]*?)';/);
    if (!m || !m[1]) continue;
    let parsed;
    try {
      parsed = JSON.parse(decodeJsSingleQuotedJson(m[1]));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const sales = parsed.sales;
    if (!Array.isArray(sales)) continue;
    for (let i = 0; i < sales.length; i++) {
      const info = metadataInfoFromSale(sales[i]);
      if (!info || !info.startDate) continue;
      const saleUrl = info.url;
      const matchUrl =
        saleUrl === normalizedHref ||
        saleUrl === canonicalHref ||
        canonicalizeUrl(saleUrl) === canonicalHref ||
        normalizeListingUrlForLookup(saleUrl) === normalizedHref;
      const id = externalIdFromListingUrl(saleUrl);
      const matchId = externalId && id === externalId;
      if (matchUrl || matchId) {
        return { start: info.startDate, end: info.endDate || info.startDate };
      }
    }
  }
  return null;
}

function parseMetadataStrSalesArrayFromDocument() {
  const scripts = Array.from(document.querySelectorAll("script"));
  for (let s = 0; s < scripts.length; s++) {
    const text = scripts[s].textContent || "";
    const m = text.match(/metadataStr\s*=\s*'([\s\S]*?)';/);
    if (!m?.[1]) continue;
    try {
      const parsed = JSON.parse(decodeJsSingleQuotedJson(m[1]));
      if (parsed?.sales && Array.isArray(parsed.sales)) return parsed.sales;
    } catch {
      continue;
    }
  }
  return null;
}

function metadataSaleRecordMatchesPage(sale, pageUrl) {
  if (!sale || typeof sale !== "object") return false;
  const normalizedPage = normalizeListingUrlForLookup(pageUrl);
  const canonicalPage = canonicalizeUrl(pageUrl);
  let pageId = null;
  try {
    pageId = new URL(pageUrl).searchParams.get("id");
  } catch {
    /* ignore */
  }
  if (typeof sale.url === "string") {
    const nu = normalizeListingUrlForLookup(sale.url);
    if (nu === normalizedPage) return true;
    if (canonicalizeUrl(sale.url) === canonicalPage) return true;
    if (normalizeListingUrlForLookup(sale.url) === normalizedPage) return true;
    if (pageId && sale.url.includes(pageId)) return true;
  }
  return false;
}

function findMetadataSaleRecordForPage(pageUrl) {
  const sales = parseMetadataStrSalesArrayFromDocument();
  if (!sales) return null;
  for (let i = 0; i < sales.length; i++) {
    if (metadataSaleRecordMatchesPage(sales[i], pageUrl)) return sales[i];
  }
  return null;
}

function extractTrailingZip5FromAddressRaw(addressRaw) {
  if (!addressRaw) return null;
  const m = String(addressRaw).match(/\b(\d{5})(?:-\d{4})?\s*$/);
  return m ? m[1] : null;
}

/** Requires City, ST ZIP already present in page text (narrow; no ZIP tables). */
function extractCityStateCommaZipFromPageText(zip5) {
  if (!zip5 || !/^\d{5}$/.test(zip5)) return { city: "", state: "" };
  const body = document.body?.innerText || "";
  const z = zip5.replace(/\\/g, "\\\\");

  // Embedded tail: "..., City, ST ZIP" (street line or long blob)
  let re = new RegExp(",\\s*([^,\\n]{2,80}?),\\s*([A-Z]{2})\\s+" + z + "(?:\\D|$)", "im");
  let m = body.match(re);
  if (m) {
    return {
      city: normalizeCityFromPathSegment(m[1].trim()),
      state: m[2].toUpperCase(),
    };
  }

  // Standalone line: "City, ST ZIP" (e.g. community header; no leading comma before city name)
  re = new RegExp("\\b([A-Za-z][^,\\n]{1,78}?),\\s*([A-Z]{2})\\s+" + z + "(?:\\D|$)", "im");
  m = body.match(re);
  if (!m) return { city: "", state: "" };
  return {
    city: normalizeCityFromPathSegment(m[1].trim()),
    state: m[2].toUpperCase(),
  };
}

/**
 * sale.php community pages only: metadata sale.address tail, else same-page ", City, ST ZIP" near street ZIP.
 * Does not use hub/session city or unrelated prose.
 */
function resolveSalePhpCommunityCityState(pageUrl, addressRaw) {
  if (!isYstmCommunitySalePhpPage(pageUrl)) return null;

  const sale = findMetadataSaleRecordForPage(pageUrl);
  if (sale && typeof sale.address === "string") {
    const normalizedAddr = sale.address.replace(/\s+/g, " ").trim();
    const tail = extractAddressTailCityStateForAuthority(normalizedAddr);
    if (tail.addressTailCity && tail.addressTailState) {
      return {
        city: tail.addressTailCity,
        state: tail.addressTailState,
        source: "metadata_sale_address",
      };
    }
  }

  const zip = extractTrailingZip5FromAddressRaw(addressRaw);
  if (zip) {
    const near = extractCityStateCommaZipFromPageText(zip);
    if (near.city && near.state) {
      return { city: near.city, state: near.state, source: "page_text_comma_before_zip" };
    }
  }

  return null;
}

function extractDomPrimaryDateRaw() {
  const body = document.body.innerText || "";
  const chunk = body.slice(0, 12000);
  let r = extractDateRangeFromText(chunk);
  if (r.start) return r.end && r.end !== r.start ? r.start + "\n" + r.end : r.start;
  const lines = body
    .split("\n")
    .map(function (l) {
      return l.trim();
    })
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    r = extractDateRangeFromText(lines[i]);
    if (r.start) return r.end && r.end !== r.start ? r.start + "\n" + r.end : r.start;
  }
  return "";
}

function buildCanonicalDateRaw(pageUrl) {
  const meta = extractYstmMetadataSaleDates(pageUrl);
  if (meta && meta.start) {
    return meta.end && meta.end !== meta.start ? meta.start + "\n" + meta.end : meta.start;
  }
  return extractDomPrimaryDateRaw();
}

function parseIsoPairFromCanonicalDateRaw(canonical) {
  const lines = String(canonical || "")
    .split(/\n/)
    .map(function (l) {
      return l.trim();
    })
    .filter(Boolean);
  if (!lines.length) return null;
  const isoRe = /^\d{4}-\d{2}-\d{2}$/;
  if (isoRe.test(lines[0])) {
    return {
      start: lines[0],
      end: lines.length > 1 && isoRe.test(lines[1]) ? lines[1] : lines[0],
    };
  }
  return null;
}

function extractTitle() {
  const heading = document.querySelector("h1");
  return heading?.textContent?.trim() || document.title || "";
}

function isDescriptionNoiseLine(line) {
  const normalized = String(line || "").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  const lower = normalized.toLowerCase().trim();
  // Only treat as "noise line" if the line is essentially just a label/link.
  if (/^(street view|directions|view on map|report listing|share listing)$/i.test(lower)) return true;
  if (/^source:\s*/i.test(lower)) return true;
  if (/^(https?:\/\/|www\.)/i.test(lower)) return true;
  if (/^\s*\d{3,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/i.test(normalized)) return true;
  if (/^\s*(\d{1,2}:\d{2}\s*(am|pm)?\s*[-–—]\s*\d{1,2}:\d{2}\s*(am|pm)?)\s*$/i.test(normalized)) return true;
  if (/^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*$/i.test(normalized)) return true;
  if (/^\s*\d{1,2}\/\d{1,2}\s*[-–—]\s*\d{1,2}\/\d{1,2}\s*$/i.test(normalized)) return true;
  if (normalized.length < 8) return true;
  return false;
}

function cleanExtractedDescription(rawText) {
  function stripInlinePollution(input) {
    let text = String(input || "");
    text = text.replace(/\b(https?:\/\/\S+|www\.\S+|[a-z0-9.-]+\.(com|net|org|info|io|co)\b\S*)/gi, "");
    text = text.replace(/\bSource:\s*[^\s,.]+(?:\s+[^\s,.]+)*/gi, "");
    text = text.replace(/\bSource:\s*/gi, "");
    text = text.replace(/\bStreet View\b/gi, "");
    text = text.replace(/\bDirections\b/gi, "");
    text = text.replace(/\bView on map\b/gi, "");
    text = text.replace(/\bReport listing\b/gi, "");
    text = text.replace(/\bShare listing\b/gi, "");
    text = text.replace(/\bFor more information\b/gi, "");
    text = text.replace(/\bplease visit us at\b/gi, "");
    text = text.replace(/\bclick here\b/gi, "");
    text = text.replace(/\bsee listing\b/gi, "");
    text = text.replace(/\bstart(?:s)?\s*time\s*:\s*\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, "");
    text = text.replace(/\bstarts?\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, "");
    text = text.replace(
      /(?:,?\s*)\d{3,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?(?=\s|$)/gi,
      ""
    );
    text = text.replace(/(?:^|[\s,;])\d{5}(?:-\d{4})?\s*,?\s*USA\b/gi, " ");
    text = text.replace(/(?:^|[\s,;])\d{5}(?:-\d{4})?\b(?=\s*$)/gi, " ");
    text = text.replace(
      /\b\d{1,2}(?::\d{2})?\s*(am|pm)\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi,
      ""
    );
    text = text.replace(/\b\d{1,2}\/\d{1,2}\s*[-–—]\s*\d{1,2}\/\d{1,2}\b/gi, "");
    text = text.replace(
      /\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\.?\s+\d{1,2}\/\d{1,2}\b/gi,
      ""
    );
    text = text.replace(/\s+/g, " ").trim();
    text = text.replace(/\s+([,.;:!?])/g, "$1");
    text = text.replace(/\.\s+\./g, ".");
    text = text.replace(/^[,.;:!?]+\s*/g, "");
    return text.trim();
  }

  const raw = String(rawText || "");
  const lines = raw
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !isDescriptionNoiseLine(line))
    .map((line) => stripInlinePollution(line))
    .filter(Boolean);

  const joined = stripInlinePollution(lines.join(" "));
  return joined || "";
}

function extractDescription() {
  const contentEls = Array.from(document.querySelectorAll(".content, .description, .listing-description, .details, [class*='description']"));
  const target = contentEls
    .filter((el) => el instanceof HTMLElement)
    .map((el) => {
      const text = el.innerText || "";
      const hasDate =
        /(\d{1,2}\/\d{1,2})|(\b\d{4}-\d{2}-\d{2}\b)|(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}/i.test(
          text
        );
      const hasTime = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.test(text);
      const cleaned = cleanExtractedDescription(text);
      const normalizedLength = cleaned.length;
      const hasSentenceLikeText = /[a-z].+[a-z]/i.test(cleaned) && !/^\d/.test(cleaned);

      // Prefer blocks with date/time signals; use text length as tie-breaker.
      const signalScore = (hasSentenceLikeText ? 120 : 0) + (hasDate ? 40 : 0) + (hasTime ? 30 : 0) + normalizedLength;
      return { el, text, cleaned, signalScore };
    })
    .sort((a, b) => b.signalScore - a.signalScore)[0]?.el;

  const rawDescription = (target && target instanceof HTMLElement
    ? target.innerText
    : contentEls
        .map((el) => (el instanceof HTMLElement ? el.innerText : ""))
        .join(" "))
  const description = cleanExtractedDescription(rawDescription);
  console.log("EXTRACTED DESCRIPTION:", description);
  return description;
}

/** US-style street + city + state on one line; on YSTM sale.php community pages also street + ZIP. */
function extractAddress() {
  const lines = (document.body.innerText || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const pattern =
    /\d{3,6}\s+[A-Za-z0-9.\-\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?/i;
  const fullLine = lines.find((l) => pattern.test(l)) ?? null;

  if (fullLine) {
    const addressRaw = fullLine.slice(0, 500);
    console.log("Address extracted:", addressRaw);
    return addressRaw;
  }

  if (typeof window !== "undefined" && isYstmCommunitySalePhpPage(window.location.href)) {
    const streetZip =
      /^\d{3,6}\s+[A-Za-z0-9.'#\-\s]+\s+\d{5}(?:-\d{4})?$/i;
    const szLine = lines.find((l) => streetZip.test(l.trim()));
    if (szLine) {
      const addressRaw = szLine.trim().slice(0, 500);
      console.log("Address extracted (street+ZIP):", addressRaw);
      return addressRaw;
    }
  }

  console.log("Address extracted:", null);
  return null;
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

function extractImages() {
  try {
    const imageApi = globalThis.LootAuraListingImage;
    const listFn = imageApi?.extractListingImageUrls;
    if (typeof listFn === "function") {
      const urls = listFn(document, window.location.href, 3);
      if (Array.isArray(urls) && urls.length > 0) {
        return {
          primary: urls[0],
          urls,
        };
      }
    }
    const singleFn = imageApi?.extractListingPrimaryImageUrl;
    if (typeof singleFn === "function") {
      const primary = singleFn(document, window.location.href);
      if (primary) {
        return {
          primary,
          urls: [primary],
        };
      }
    }
  } catch (e) {
    console.warn("[LootAura] listing image extraction failed:", e);
  }
  return { primary: null, urls: [] };
}

function formatUploadFailureMessage(response) {
  if (!response) return "No response from upload bridge.";
  const lines = [];
  const status = Number(response.status || 0);
  lines.push(`HTTP ${Number.isFinite(status) && status > 0 ? status : "?"}`);

  if (response.serverCode) lines.push(`Server code: ${response.serverCode}`);
  if (response.serverMessage) lines.push(`Server message: ${response.serverMessage}`);
  else if (response.error) lines.push(`Detail: ${response.error}`);

  if (response.summary != null) {
    try {
      lines.push(`Summary: ${JSON.stringify(response.summary)}`);
    } catch {
      lines.push("Summary: (unserializable)");
    }
  }

  if (response.requestId) lines.push(`Request ID: ${response.requestId}`);
  if (response.ingestionRunId) lines.push(`Ingestion run: ${response.ingestionRunId}`);

  if (status === 429) {
    const sec = response.retryAfterSec;
    if (typeof sec === "number" && sec > 0) {
      lines.push(`Retry-After: about ${sec} second(s)`);
    }
  }

  return lines.join("\n");
}

function buildSubmissionPayload(session, currentUrl, selectedTags) {
  const addressRaw = extractAddress();
  const auth = resolveYstmListingCityAuthorityJs(currentUrl, addressRaw);

  let resolvedCity = auth.resolvedCity;
  let resolvedState = auth.resolvedState;

  if (!auth.isYstmPath) {
    const urlDerived = deriveCityStateFromUrl(currentUrl);
    const legacy = extractCityState(addressRaw);
    const tail = extractAddressTailCityStateForAuthority(addressRaw);
    resolvedCity = tail.addressTailCity || urlDerived.city || legacy.city || "";
    resolvedState = tail.addressTailState || urlDerived.state || legacy.state || "";
  }

  if ((!resolvedCity || !resolvedState) && isYstmCommunitySalePhpPage(currentUrl)) {
    const fb = resolveSalePhpCommunityCityState(currentUrl, addressRaw);
    if (fb && fb.city && fb.state) {
      resolvedCity = fb.city;
      resolvedState = fb.state;
    }
  }

  if (!resolvedCity || !resolvedState) {
    const detail = isYstmCommunitySalePhpPage(currentUrl)
      ? "Unable to determine city/state for this community sale (metadata address with City, ST, or a City, ST ZIP line on this page)."
      : "Unable to determine city/state from listing address or URL";
    throw new Error(detail);
  }
  const imageExtract = extractImages();
  const dateRaw = buildCanonicalDateRaw(currentUrl);
  const isoPair = parseIsoPairFromCanonicalDateRaw(dateRaw);
  console.log("City/state extracted:", { city: resolvedCity, state: resolvedState });
  console.log("[LootAura] Canonical dateRaw / ISO:", { dateRaw, isoPair });

  return {
    records: [
      {
        sourcePlatform: "external_page_source",
        sourceUrl: currentUrl,
        externalId: null,
        title: extractTitle(),
        description: extractDescription(),
        addressRaw,
        dateRaw,
        imageSourceUrl: imageExtract.primary,
        cityHint: resolvedCity,
        stateHint: resolvedState,
        rawPayload: {
          tags: selectedTags,
          collectedAt: Date.now(),
          ystmListingCityAuthority: {
            pathCitySlug: auth.pathCitySlug,
            hubSegment: auth.hubSegment,
            addressTailCity: auth.addressTailCity,
            cityConflict: auth.cityConflict,
            streetConcrete: auth.streetConcrete,
            citySource: auth.citySource,
            stateSource: auth.stateSource,
            resolvedCity: auth.isYstmPath ? auth.resolvedCity : resolvedCity,
            resolvedState: auth.isYstmPath ? auth.resolvedState : resolvedState,
            urlMunicipalityNormalized: auth.urlMunicipalityNormalized || null,
          },
          ...(imageExtract.urls.length > 0 ? { imageUrls: imageExtract.urls } : {}),
          ...(isoPair ? { ystmCanonicalDateStart: isoPair.start, ystmCanonicalDateEnd: isoPair.end } : {}),
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
    void (async () => {
      disableButtons();
      console.log("[LootAura] Submit clicked:", currentUrl);

      const selectedTags = Array.from(tagsWrap.querySelectorAll("input[type='checkbox']"))
        .filter((el) => el.checked)
        .map((el) => el.getAttribute("data-tag") || "")
        .filter(Boolean);
      let payload;
      try {
        payload = buildSubmissionPayload(session, currentUrl, selectedTags);
      } catch (error) {
        console.error("[LootAura] Failed to build submission payload:", error);
        alert(
          error instanceof Error
            ? `Cannot submit this listing: ${error.message}`
            : `Cannot submit this listing: ${String(error)}`
        );
        enableButtons();
        return;
      }
      console.log("[LootAura] Payload built:", payload);

      let response;
      try {
        response = await sendRuntimeMessage({ type: "SUBMIT_SALE", payload });
      } catch (error) {
        console.error("[LootAura] Submit transport failed:", error);
        alert(
          error instanceof Error
            ? `Submit failed: ${error.message}`
            : `Submit failed: ${String(error)}`
        );
        enableButtons();
        return;
      }

      try {
        console.log("[LootAura] Full upload response payload:", JSON.stringify(response, null, 2));
      } catch (e) {
        console.log("[LootAura] Full upload response (non-serializable):", response);
      }
      console.log("[LootAura] Submission response:", response?.status, response?.ok);

      if (!response || !response.ok) {
        alert(`Upload not saved.\n\n${formatUploadFailureMessage(response)}`);
        console.warn("[LootAura] Submit not acknowledged:", response);
        enableButtons();
        return;
      }

      if (!Array.isArray(session.processedUrls)) session.processedUrls = [];
      if (!session.processedUrls.includes(currentUrl)) {
        session.processedUrls.push(currentUrl);
      }
      session.currentIndex += 1;
      saveSessionAndNavigate(session);
    })();
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

// Expose cleaner for test harnesses only.
if (typeof globalThis !== "undefined") {
  globalThis.__LootAuraContentScriptTest = {
    isDescriptionNoiseLine,
    cleanExtractedDescription,
    normalizeCityFromPathSegment,
    deriveCityStateFromUrl,
    shouldQueueYstmUrl,
    isYstmCommunitySalePhpPage,
    resolveSalePhpCommunityCityState,
    buildSubmissionPayload,
  };
}
})();

