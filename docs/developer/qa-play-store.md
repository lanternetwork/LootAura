# Loot Aura — User Experience & QA Testing Plan (Play Store / Public User)

**Audience:** QA analysts  
**Channel:** Android app installed from **Google Play** (production build)  
**Access model:** Same as any member of the public—**no admin or internal tools**. Testers may **create their own** consumer accounts for logged-in flows.

**Product context:** The Android app primarily hosts a **WebView** pointed at `https://lootaura.com`, with native pieces such as splash, location permission, and App Links for authentication callbacks.

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)  
2. [Roles and access model](#2-roles-and-access-model)  
3. [Test environment](#3-test-environment)  
4. [Documentation and reporting](#4-documentation-and-reporting)  
5. [Detailed test areas](#5-detailed-test-areas)  
6. [Deep link and external integration matrix](#6-deep-link-and-external-integration-matrix)  
7. [Compatibility matrix](#7-compatibility-matrix)  
8. [Exploratory charter](#8-exploratory-charter)  
9. [Release sign-off gate](#9-release-sign-off-gate)  
10. [Artifacts for the analyst](#10-artifacts-for-the-analyst)  
11. [Release smoke test (15 minutes)](#11-release-smoke-test-15-minutes)

---

## 1. Purpose and scope

### Goal

Validate end-to-end **user experience**, **functional correctness** from a customer’s perspective, and **Android / WebView integration** for the production Play build.

### In scope

- Install → first launch → ongoing use as a Play Store customer.
- **Anonymous** journeys (browse map and listings).
- **Registered user** journeys using accounts the tester **creates themselves** (still “public”—no internal privileges).
- Device, network, permission, and accessibility behavior.

### Out of scope (unless product explicitly requests)

- Admin, moderation tools, internal APIs, load testing.
- iOS (use a separate plan if needed).

### Success criteria (examples)

- No blocking crashes; critical paths completable with clear, actionable errors when something fails.
- Location, map, and listing flows are understandable without internal documentation.
- Authentication and deep links work from a cold start after install.

---

## 2. Roles and access model

| Role | Typical use |
|------|-------------|
| **Anonymous** | Map, search, sale detail, marketing pages, sign-in/sign-up entry points. |
| **Self-created account** | Favorites, sell/listing flows, profile, seller-only surfaces, optional payments. |

### Rules for the analyst

- Do **not** use shared “test admin” or staff credentials.
- Use **disposable** personal or team-owned throwaway accounts if email verification is required.
- On every bug report, record **app version / versionCode** (from Play or in-app About, if present) and **Android OS version**.

---

## 3. Test environment

### Devices (minimum)

- **Phone A:** Current Android (e.g. 14 or 15), “clean” OEM profile (e.g. Pixel or Samsung).
- **Phone B:** A device near the app’s **minimum supported Android** version (per Play Console / `minSdk`).
- **Tablet (optional):** If tablets or large screens are supported.

### Network and connectivity

- **Wi‑Fi** and **mobile data** (LTE/5G).
- **Degraded connectivity** where possible (e.g. data saver, weak signal)—note subjective performance.
- **Offline / airplane mode** after content has loaded at least once.

### Display

- **Light** and **dark** system themes (app may follow system `userInterfaceStyle`).

### Location

- **Real GPS** in at least two contexts (e.g. dense urban vs suburban).
- **Deny** location once; **Allow while using** once.
- Avoid mock location unless org policy explicitly allows it; prefer real movement or known-good areas.

---

## 4. Documentation and reporting

### For each issue, capture

- Steps to reproduce, **expected vs actual** behavior.
- **Screenshot or screen recording** where helpful.
- Device model, OS version, **app version**, network type, **logged in vs anonymous**.

### Severity (suggested)

- **Blocker** — Cannot complete a critical journey; crash; data loss.
- **Major** — Serious UX or functional defect with no reasonable workaround.
- **Minor** — Incorrect but workaround exists; small functional bug.
- **Cosmetic** — Visual/copy only.

### Area tags (examples)

`Splash`, `WebView`, `Map`, `List`, `Search`, `SaleDetail`, `Auth`, `Favorites`, `Sell`, `Profile`, `Payments`, `Legal`, `Performance`, `Accessibility`.

### Regression

Maintain a short **smoke checklist** (Section 11) and run it on every release candidate or hotfix.

---

## 5. Detailed test areas

### 5.1 Play Store and first run

- Discover app in Play Store; verify listing (**icon, screenshots, description, permissions**) matches the installed app.
- Install time/size; use **Open** from Play.
- **First launch:** splash branding; **no long incorrect flash** (e.g. white/black) before branded background; transition into WebView feels intentional.
- **Cold start** vs **warm start** (return from recent apps).
- **App switcher:** resume after 30+ minutes—no blank WebView, no stuck splash.
- **Force stop** → reopen.

**UX focus:** Trust, perceived speed, clarity of any system dialogs.

---

### 5.2 Android system integration

- **Back (gesture or button):** navigates within WebView history where expected; does not unexpectedly exit the app; from sale detail, back returns to map/list sensibly.
- **Home** then return: state preserved or gracefully reloaded.
- **Keyboard:** search and forms—**Done/Enter**, dismiss keyboard, primary buttons not obscured.
- **Rotation:** If portrait-only, rotating must not break layout; if rotation allowed, layouts remain usable.
- **Notifications:** If push is in scope, permission prompts and settings; otherwise document “N/A.”
- **External links:** Tapping `lootaura.com` links from email/chat opens **in-app** vs **Chrome**—document actual behavior consistently.

---

### 5.3 Permissions

- **Location (fine):** When is the prompt shown (on first map use vs immediately on launch)? Match product intent.
- **Deny:** Clear **fallback** (e.g. manual zip/city, default map center).
- **Deny permanently:** User can still use core browse flows or sees clear guidance.
- **Allow:** Map centers appropriately; no inappropriate repeated prompts every session.

---

### 5.4 WebView shell and performance

- Smooth **scrolling** on map and long lists; note jank, accidental zoom.
- **Pull-to-refresh** if present.
- **Long pages** (sale detail, legal): scroll performance; sticky UI if any.
- **Mid-flight failure** (e.g. airplane mode during load): error message, **retry**, no infinite spinner.
- **Memory:** Open many sale details, return to map; watch for reload loops, OOM, or lost state.

---

### 5.5 Discovery — map and listings (`/sales` and related)

**As anonymous user**

- Map **tiles** load; no persistent “configuration” or token errors for normal users.
- **Pins / clustering** (if applicable): tap behavior matches expectations.
- **Viewport:** pan/zoom; list/map sync; behavior after **back** navigation.
- **“Use my location”** and **manual location** flows.
- **Filters:** categories, dates, bbox/distance—**visible active filter** state and **reset**.
- **Search:** empty query, normal query, long string, special characters; empty results messaging.
- **Pagination / infinite scroll:** end of list, duplicates, loading indicators.
- **Sparse regions:** empty state is friendly and accurate.

**UX:** Tap target size, contrast, loading states vs blank screens.

---

### 5.6 Sale detail

- Open from map and from list.
- **External URL** `https://lootaura.com/sales/<id>` opened from Chrome—compare to experience when navigating inside the app.
- **Images:** gallery, swipe, broken-image handling.
- **Schedule and address:** clarity for ended vs upcoming; timezone readability.
- **Share:** Android share sheet; shared link works for recipient.
- **Favorite** while logged out: appropriate sign-in prompt.
- **Report / safety** (if public): form completion, confirmation, no crash.

---

### 5.7 Authentication (self-service only)

Relevant App Link paths include `https://lootaura.com/auth/callback` and `https://lootaura.com/auth/native-callback` (verify in current `app.json` / production).

- **Sign up:** validation errors (email, password); duplicate email.
- **Sign in:** password; magic link if offered.
- **OAuth (e.g. Google)** if enabled: completes and returns user to a sensible screen **inside** the app experience.
- **Password reset:** email link on mobile; session state in app after return.
- **Sign out** and **cold restart:** no access to prior user’s private data via back navigation.
- **Errors:** wrong password, network failure—copy is actionable.

**UX:** Minimal steps, no dead ends after redirect.

---

### 5.8 Logged-in — favorites

- Add/remove from list and detail views.
- **Favorites** page: load, empty state, ordering.
- Cross-device sync: only test if product promises it; otherwise document observed behavior.

---

### 5.9 Logged-in — sell / create listing

Adapt steps to the actual wizard:

- Start **new sale**; **save draft**; **resume draft** in a new session.
- **Validation** on required fields.
- **Images:** upload from gallery (and camera if supported in WebView).
- **Sale location:** search, map pin, edits.
- **Preview** and **publish**; confirmation; listing visible on map when published.
- **Edit**, **archive**, **delete** if exposed: confirmations and outcomes.

**UX:** Progress indication; warnings when navigating back with unsaved data (if applicable).

---

### 5.10 Profile and account

- View/edit profile, avatar, display rules.
- **Notification** preferences (email / push as applicable).
- **Account removal** or privacy flows if linked: complete flow; note email follow-up (without sharing PII in reports).

---

### 5.11 Payments and promotions (if live for normal sellers)

- Promotion purchase via **Stripe** (or equivalent) in WebView: field focus, 3DS if triggered, success and cancel paths.
- Post-purchase UI and listing state (e.g. featured).
- **Declined card** and **network drop:** messaging and retry.

*Mark N/A if feature is disabled in production.*

---

### 5.12 Content, trust, and safety

- **Terms** and **Privacy** readable on narrow screens.
- **Ads** (if any): do not block primary actions; no deceptive placement.
- **External links:** open correctly; user can return.
- **Stress layout:** long descriptions, many images, unusual characters.

---

### 5.13 Accessibility

- **TalkBack:** complete main tasks where feasible; note if map is unusable with screen reader (document as limitation or bug per product).
- **System font scaling** (largest): no clipped text or unusable buttons.
- **Contrast** on primary buttons and links.

---

### 5.14 Localization and input

- Confirm consistent language if English-only.
- **Addresses**, ZIP, names with **Unicode**—no silent corruption.

---

### 5.15 Security-adjacent UX (user-visible)

- No **mixed content** or certificate warnings in normal use.
- After **sign out**, private pages do not show prior user content via back stack.
- Bug screenshots: **redact** addresses/PII where appropriate.

---

## 6. Deep link and external integration matrix

| Source | Expected to verify |
|--------|---------------------|
| Link to `/sales/...` from Gmail / Slack / SMS | Opens in app browser vs external Chrome; correct sale |
| OAuth completion | User lands signed in; no loop |
| Password reset email | Flow completable on phone |

---

## 7. Compatibility matrix

| Scenario | Wi‑Fi | Mobile data | Airplane (after load) |
|----------|-------|-------------|------------------------|
| Cold start | ✓ | ✓ | ✓ |
| Map + browse | ✓ | ✓ | ✓ (note degradation) |
| Auth | ✓ | ✓ | Expect failure (document) |

---

## 8. Exploratory charter

Time-box **2–4 hours** of unscripted exploration:

1. **“New user in an unfamiliar city”** — find relevant sales without support.  
2. **“First-time seller”** — publish one sale in a single session.  
3. **“Location denied forever”** — browse and search remain viable.

Capture **confusion points** and **positive surprises** separately.

---

## 9. Release sign-off gate

**Example blockers**

- Crash on cold start or immediately after install.
- Cannot complete sign-in/sign-up for a normal account.
- Map or listing browse completely broken for anonymous users.
- Cannot publish a sale when the feature is live for sellers.
- Payment succeeds with no confirmation or wrong listing state.

**Non-blockers**

- Minor spacing/copy, rare edge cases with workaround.

---

## 10. Artifacts for the analyst

- This document.
- Policy on **disposable test email** (allowed/blocked).
- Short list of **known limitations** (e.g. WebView vs native screens).
- Confirmation that testing targets **production Play build** only (no staging credentials).

---

## 11. Release smoke test (15 minutes)

Run before sign-off on each candidate build:

1. Install or update from Play.  
2. Cold start → splash → **map (or home) loads**.  
3. Open **one sale detail** → **back**.  
4. Run **one search** or filter change.  
5. **Sign in** (self-created account) → **favorite** a sale → **sign out**.  
6. **Deny location** once → confirm **fallback** still allows browse.  
7. Enable **airplane mode** on sale detail → acceptable error/retry (no hang).

---

## Document control

| Field | Value |
|-------|--------|
| Title | UX & QA Testing Plan — Play Store / Public User |
| Location | `docs/QA_UX_TESTING_PLAN_PLAY_STORE.md` |
| Based on | Product architecture: WebView + lootaura.com, native splash & App Links |

Update this document when major flows change (auth hosts, min Android version, seller/payments rollout).
