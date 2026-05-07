/**
 * Listing-aware primary image URL for extension ingestion (HTTPS-only URLs).
 * Loaded before content-script.js; exposes globalThis.LootAuraListingImage.
 *
 * YSTM (yardsaletreasuremap.com) — from live listing/userlisting pages:
 * - Early document <img> is often /pics/YSTM_site_logo.png (header); must not win.
 * - Listing copy and dates sit under familiar containers; we match extractDescription’s
 *   `.content` plus `main`, `article`, `h1` ancestors, and `[role=dialog]` / `.modal` for lightboxes.
 * - Prefer `src`; many sites use `data-src` / lazy placeholders — we read those without fetching.
 */
(function (global) {
  "use strict";

  const REJECT_SUBSTRINGS = [
    "logo",
    "site_logo",
    "ystm_site",
    "favicon",
    "sprite",
    "icon",
    "banner",
    "avatar",
    "tracking",
    "pixel",
    "/nav",
    "/header",
    "header_",
    "_header",
    "navbar",
    "app-store",
    "googleplay",
  ];

  const PHOTO_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

  function lowerPath(u) {
    try {
      return new URL(u).pathname.toLowerCase();
    } catch {
      return "";
    }
  }

  function shouldRejectHref(href) {
    if (!href || typeof href !== "string") return true;
    const p = lowerPath(href);
    if (!p) return true;
    for (let i = 0; i < REJECT_SUBSTRINGS.length; i++) {
      if (p.indexOf(REJECT_SUBSTRINGS[i]) !== -1) return true;
    }
    if (/\.svg(\?|#|$)/i.test(p)) {
      if (p.indexOf("logo") !== -1 || p.indexOf("icon") !== -1 || p.indexOf("sprite") !== -1) return true;
    }
    if (/1x1|blank\.gif|spacer\.|pixel\.gif/i.test(p)) return true;
    return false;
  }

  /**
   * @param {string} raw
   * @param {string} pageUrl
   * @returns {string|null}
   */
  function normalizeToHttpsAbsolute(raw, pageUrl) {
    if (!raw || typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    if (/^data:/i.test(t)) return null;
    try {
      const u = new URL(t, pageUrl);
      if (u.protocol !== "https:") return null;
      try {
        ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach(function (k) {
          u.searchParams.delete(k);
        });
      } catch (_) {
        /* ignore */
      }
      return u.href;
    } catch {
      return null;
    }
  }

  function firstSrcsetUrl(srcset) {
    if (!srcset || typeof srcset !== "string") return null;
    const part = srcset.split(",")[0];
    if (!part) return null;
    const url = part.trim().split(/\s+/)[0];
    return url || null;
  }

  function extractBackgroundImageUrl(el, pageUrl) {
    if (!el || !el.style) return null;
    const bg = el.style.backgroundImage || "";
    if (!bg || bg === "none") return null;
    const m = bg.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    if (!m || !m[1]) return null;
    return normalizeToHttpsAbsolute(m[1].trim(), pageUrl);
  }

  function elementRejectClassOrId(el) {
    if (!el || !el.getAttribute) return true;
    const id = (el.id || "").toLowerCase();
    const cls = (el.className && String(el.className).toLowerCase()) || "";
    const hay = id + " " + cls;
    return (
      hay.indexOf("logo") !== -1 ||
      hay.indexOf("nav") !== -1 ||
      hay.indexOf("header") !== -1 ||
      hay.indexOf("toolbar") !== -1 ||
      hay.indexOf("menu-bar") !== -1 ||
      hay.indexOf("app-bar") !== -1
    );
  }

  function imgNaturalArea(img) {
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    if (nw > 0 && nh > 0) return nw * nh;
    const ow = img.offsetWidth || 0;
    const oh = img.offsetHeight || 0;
    if (ow > 0 && oh > 0) return ow * oh;
    const w = parseInt(img.getAttribute("width") || "0", 10);
    const h = parseInt(img.getAttribute("height") || "0", 10);
    if (w > 0 && h > 0) return w * h;
    return 0;
  }

  function imgTooSmall(img) {
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    const ow = img.offsetWidth || 0;
    const oh = img.offsetHeight || 0;
    const wAttr = parseInt(img.getAttribute("width") || "0", 10);
    const hAttr = parseInt(img.getAttribute("height") || "0", 10);
    const w = nw || ow || wAttr;
    const h = nh || oh || hAttr;
    if (w > 0 && h > 0 && w < 48 && h < 48) return true;
    return false;
  }

  function imgAltLooksBranding(img) {
    const alt = (img.getAttribute("alt") || "").toLowerCase();
    return alt.indexOf("logo") !== -1 || alt.indexOf("icon") !== -1 || alt.indexOf("yard sale treasure") !== -1;
  }

  function collectImgUrls(img, pageUrl) {
    const out = [];
    const attrs = ["src", "data-src", "data-lazy-src", "data-original", "data-lazy", "data-url"];
    for (let i = 0; i < attrs.length; i++) {
      const v = img.getAttribute(attrs[i]);
      if (v) {
        const n = normalizeToHttpsAbsolute(v, pageUrl);
        if (n) out.push(n);
      }
    }
    const ss = img.getAttribute("srcset") || img.getAttribute("data-srcset");
    const fs = firstSrcsetUrl(ss || "");
    if (fs) {
      const n2 = normalizeToHttpsAbsolute(fs, pageUrl);
      if (n2) out.push(n2);
    }
    return out;
  }

  function uniqueStrings(arr) {
    const seen = {};
    const o = [];
    for (let i = 0; i < arr.length; i++) {
      if (!seen[arr[i]]) {
        seen[arr[i]] = true;
        o.push(arr[i]);
      }
    }
    return o;
  }

  /**
   * @typedef {{ url: string, tier: number, area: number, img?: HTMLImageElement }} Candidate
   */

  /**
   * @param {HTMLImageElement} img
   * @param {number} tier
   * @param {string} pageUrl
   * @param {Candidate[]} bucket
   */
  function pushImgCandidates(img, tier, pageUrl, bucket) {
    if (!img || elementRejectClassOrId(img)) return;
    if (imgTooSmall(img)) return;
    if (imgAltLooksBranding(img)) return;
    const urls = uniqueStrings(collectImgUrls(img, pageUrl));
    const area = imgNaturalArea(img);
    for (let i = 0; i < urls.length; i++) {
      const href = urls[i];
      if (shouldRejectHref(href)) continue;
      bucket.push({ url: href, tier: tier, area: area, img: img });
    }
  }

  /**
   * @param {Element} root
   * @param {number} tier
   * @param {string} pageUrl
   * @param {Candidate[]} bucket
   */
  function collectImagesUnder(root, tier, pageUrl, bucket) {
    if (!root || !root.querySelectorAll) return;
    const imgs = root.querySelectorAll("img");
    for (let i = 0; i < imgs.length; i++) {
      pushImgCandidates(imgs[i], tier, pageUrl, bucket);
    }
    const bgEls = root.querySelectorAll(
      "[style*='background-image'], [class*='photo'], [class*='gallery'], [class*='listing-image'], [class*='sale-image']"
    );
    for (let j = 0; j < bgEls.length; j++) {
      const el = bgEls[j];
      if (elementRejectClassOrId(el)) continue;
      const u = extractBackgroundImageUrl(el, pageUrl);
      if (!u || shouldRejectHref(u)) continue;
      const ar = (el.offsetWidth || 0) * (el.offsetHeight || 0);
      bucket.push({ url: u, tier: tier, area: ar });
    }
  }

  function findModalRoots(doc) {
    const s = new Set();
    doc.querySelectorAll('[role="dialog"], .modal, [class*="Modal"], [class*="modal"]').forEach(function (el) {
      s.add(el);
    });
    return Array.from(s);
  }

  function findListingContentRoots(doc) {
    const roots = [];
    const seen = new Set();
    function add(el) {
      if (el && !seen.has(el)) {
        seen.add(el);
        roots.push(el);
      }
    }
    doc.querySelectorAll("main, [role='main'], article, .content, #content").forEach(add);
    const h1 = doc.querySelector("h1");
    if (h1) {
      let p = h1.parentElement;
      let depth = 0;
      while (p && depth < 8) {
        add(p);
        p = p.parentElement;
        depth++;
      }
    }
    return roots;
  }

  /**
   * @param {Candidate[]} candidates
   * @returns {string|null}
   */
  function pickBest(candidates) {
    let best = null;
    let bestScore = -1;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const tierW = c.tier * 1e12;
      const area = Math.min(c.area || 0, 1e10);
      const extBonus = PHOTO_EXT.test(c.url) ? 5000 : 0;
      const score = tierW + area + extBonus;
      if (score > bestScore) {
        bestScore = score;
        best = c.url;
      }
    }
    return best;
  }

  /**
   * @param {Document} doc
   * @param {string} pageUrl
   * @returns {string|null}
   */
  function extractListingPrimaryImageUrl(doc, pageUrl) {
    if (!doc || !pageUrl) return null;
    const bucket = [];

    findModalRoots(doc).forEach(function (root) {
      collectImagesUnder(root, 100, pageUrl, bucket);
    });

    findListingContentRoots(doc).forEach(function (root) {
      collectImagesUnder(root, 70, pageUrl, bucket);
    });

    const h1 = doc.querySelector("h1");
    if (h1) {
      const local = h1.parentElement;
      if (local) collectImagesUnder(local, 85, pageUrl, bucket);
    }

    collectImagesUnder(doc.body, 20, pageUrl, bucket);

    return pickBest(bucket);
  }

  global.LootAuraListingImage = {
    extractListingPrimaryImageUrl: extractListingPrimaryImageUrl,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
