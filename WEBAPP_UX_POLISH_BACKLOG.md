# Webapp UX Polish Backlog (LootAura)

**Source:** Extracted from `WEBAPP_UX_POLISH_AUDIT.md`  
**Date:** December 2024  
**Prioritization:** Based on user impact and implementation effort

---

## 1. High-Priority UX Improvements (Map / Filters / List)

### [S, H] Add "No sales in this area" empty state to map viewport

**Area:** Map screen (`app/sales/SalesClient.tsx`, `components/location/SimpleMap.tsx`)

**Summary:** Currently, when the map viewport has no sales, there's no feedback to the user. The map just shows no pins with no explanation. Add a contextual empty state message when `filteredSales.length === 0` that suggests "Zoom out", "Try a different location", or "Clear filters" as actionable CTAs. This directly addresses user confusion about why no results appear.

**Effort:** S (small, < 0.5 day)  
**Impact:** H (high user impact / core flow)

---

### [S, H] Remove debug info from FiltersModal production UI

**Area:** Filter modal (`components/filters/FiltersModal.tsx`)

**Summary:** The audit found debug output (`JSON.stringify(filters.dateRange)`) visible in production around line 333-335. This should be removed or gated behind `NEXT_PUBLIC_DEBUG` flag. Simple cleanup that improves production polish.

**Effort:** S (small, < 0.5 day)  
**Impact:** H (high user impact - removes confusing debug output)

---

### [M, H] Add per-filter reset buttons

**Area:** Filter modal (`components/filters/FiltersModal.tsx`)

**Summary:** Users currently must manually deselect categories, change date back to "Any", and adjust distance to reset individual filters. There's a "Clear All" button, but no per-filter reset. Add small "X" buttons next to each active filter (distance, date range, categories) that reset just that filter to its default. Improves filter UX significantly.

**Effort:** M (medium, ~0.5–1 day)  
**Impact:** H (high user impact - core filter interaction)

---

### [S, H] Add loading indicator for viewport-based sales fetching

**Area:** Map screen (`app/sales/SalesClient.tsx`)

**Summary:** When users pan/zoom the map, sales are fetched based on the new viewport (debounced 500ms), but there's no explicit loading feedback. The list shows skeletons during initial load, but not during viewport changes. Add a subtle "Loading sales..." spinner or message in the list area during `fetchMapSales` calls to provide feedback that the system is responding to map interactions.

**Effort:** S (small, < 0.5 day)  
**Impact:** H (high user impact - core map interaction feedback)

---

### [M, H] Add distance badges to sale cards

**Area:** Sale card component (`components/SaleCard.tsx`)

**Summary:** Distance is calculated server-side and available in the data, but not displayed on sale cards. Users have no visual indication of how far each sale is from their location or search center. Add a distance badge (e.g., "2.3 mi") to each sale card, positioned near the address or as a small chip. This is a high-value visual cue that helps users prioritize which sales to visit.

**Effort:** M (medium, ~0.5–1 day)  
**Impact:** H (high user impact - core list readability)

---

### [S, M] Add "Ending soon" and "New" badges to sale cards

**Area:** Sale card component (`components/SaleCard.tsx`)

**Summary:** Sale cards currently show no visual cues for urgency or recency. Add badges for "Ending soon" (sale ends within 24 hours) and "New" (created within last 7 days). These help users prioritize which sales to check out first. Calculate from `date_end`/`time_end` and `created_at` fields.

**Effort:** S (small, < 0.5 day)  
**Impact:** M (medium - helpful but not blocking)

---

## 2. Medium-Priority UX Improvements

### [x] [M, M] Implement tooltip system for UI explanations ✅

**Area:** Shared UI components (`components/ui/Tooltip.tsx`), filter modal, map components

**Summary:** Tooltip system implemented. Added tooltips to: filter controls (distance, date, categories), re-center button, and "More filters" button. Tooltips provide helpful explanations without cluttering the UI.

**Status:** ✅ **COMPLETED** - Tooltips added to filter controls, re-center button, and filter buttons. Debug info in FiltersModal gated behind debug flag.

---

### [x] [L, M] Improve mobile sale detail flow ✅

**Area:** Sale detail page (`app/sales/[id]/SaleDetailClient.tsx`), mobile map shell (`app/sales/MobileSalesShell.tsx`)

**Summary:** Mobile sale detail page already includes a prominent "Back to map" button that restores the previous viewport. The flow is working well.

**Status:** ✅ **COMPLETED** - "Back to map" button exists and works correctly.

---

### [x] [M, M] Add keyboard shortcuts for common actions ✅

**Area:** Layout components (`lib/keyboard/shortcuts.ts`)

**Summary:** Keyboard shortcuts implemented: `/` to focus search bar, `F` to open filters (mobile). Added hints in tooltips and input titles.

**Status:** ✅ **COMPLETED** - Shortcuts work on desktop. Hints added to ZIP input and filter button tooltips.

---

### [x] [S, M] Add contextual empty state suggestions ✅

**Area:** Empty state component (`components/EmptyState.tsx`), sales list (`app/sales/SalesClient.tsx`, `app/sales/MobileSalesShell.tsx`)

**Summary:** Enhanced empty states with contextual suggestions based on active filters (distance, date range, categories) and map viewport state. Suggestions are actionable and specific.

**Status:** ✅ **COMPLETED** - Contextual suggestions added for distance filter, date range, categories, and zoom level.

---

### [x] [S, M] Add "Re-center" / "Reset view" button to map ✅

**Area:** Map controls (`app/sales/MobileSalesShell.tsx`, `components/location/MobileRecenterButton.tsx`)

**Summary:** Re-center button implemented **mobile-only** with viewport-aware visibility. Button appears only when user's location is outside the current map viewport. On tap, animates map back to user location using Mapbox `flyTo` with 1-second animation. Uses existing `onViewportChange` mechanism to keep map and list in sync. Button positioned bottom-right, above mode toggle. No desktop re-center control (by design).

**Status:** ✅ **COMPLETED** - Viewport-aware re-center button implemented. Uses `isPointInsideBounds` utility to determine visibility. Animated via mapRef.flyTo, then triggers viewport change pipeline.

---

### [x] [S, L] Add hover tooltips on map markers (desktop only) ✅

**Area:** Map pin components (`components/location/LocationPin.tsx`, `components/location/HybridPinsOverlay.tsx`)

**Summary:** Hover tooltips already implemented in LocationPin component. Tooltips show sale title or count on desktop only, disabled on mobile.

**Status:** ✅ **COMPLETED** - Marker hover tooltips work correctly via LocationPin component.

---

### [x] [M, L] Improve responsive list sidebar width ✅

**Area:** Map + list layout (`app/sales/SalesClient.tsx`)

**Summary:** Sidebar already uses responsive `minmax()` widths that scale between min and max values based on viewport size. This is better than fixed widths and adapts well to different screen sizes.

**Status:** ✅ **COMPLETED** - Sidebar uses responsive `minmax()` widths (320-420px on md, 380-480px on lg, 420-540px on xl, 480-600px on 2xl).

---

## 3. Low-Priority / Nice-to-Have Improvements

- **Add "Popular" badge to sale cards** - Calculate based on favorite count or view count (if tracked), display as badge. Low priority since popularity metrics may not be available.

- **Add swipe gestures to filter modal on mobile** - Currently filter modal is a bottom sheet, but swipe-to-dismiss could be smoother. Low priority since close button exists.

- **Add loading progress indicators for slow operations** - For operations that take >2 seconds, show progress bar instead of spinner. Low priority since most operations are fast.

- **Add micro-animations to filter chips** - Subtle animations when filters are applied/removed. Cosmetic polish only.

- **Add "Search this area" explicit button** - Even though auto-refresh exists, some users might want explicit control. Low priority since auto-refresh works well.

- **Add color-coded date chips** - Color-code date/time chips based on urgency (red for ending soon, green for new). Cosmetic enhancement.

- **Add keyboard navigation hints in UI** - Show small hints like "Press / to search" in search bar placeholder or help text. Low priority since shortcuts are discoverable via `?` help.

---

## 4. Notes & Dependencies

### Component Dependencies
- Several high-priority items touch `components/SaleCard.tsx` (distance badges, "Ending soon"/"New" badges). Consider grouping these into a single PR to avoid merge conflicts.

- Filter improvements (per-filter reset, tooltips, debug removal) all touch `components/filters/FiltersModal.tsx`. These can be grouped together.

- Map-related improvements (empty state, loading indicator, re-center button) touch `app/sales/SalesClient.tsx` and map components. Coordinate these changes to avoid conflicts.

### Testing Considerations
- Mobile-specific improvements (sale detail flow, responsive sidebar) should be validated on both:
  - Mobile web browsers (iOS Safari, Chrome Android)
  - Expo wrapper (if applicable)
  - Desktop responsive mode (browser dev tools)

- Tooltip system implementation should include:
  - Keyboard accessibility (tooltips should be dismissible via keyboard)
  - Screen reader compatibility (ARIA attributes)
  - Touch device handling (tooltips may need different behavior on mobile)

### Performance Considerations
- Adding distance badges requires ensuring distance calculation is already available in the data (server-side calculation is already done per audit).

- Loading indicators for viewport fetching should be lightweight to avoid impacting map performance during frequent pan/zoom interactions.

### Accessibility Requirements
- All new interactive elements (tooltips, keyboard shortcuts, reset buttons) must:
  - Have proper ARIA labels
  - Be keyboard accessible
  - Have visible focus indicators
  - Work with screen readers

- Follow existing patterns from `components/a11y/SkipToContent.tsx` and a11y test files for consistency.

### Implementation Order Recommendation
1. **Week 1:** High-priority S-effort items (empty state, debug removal, loading indicator, badges)
2. **Week 2:** High-priority M-effort items (per-filter reset, distance badges)
3. **Week 3+:** Medium-priority items (tooltips, keyboard shortcuts, mobile flow improvements)

This order maximizes user impact early while building on shared components (like SaleCard) efficiently.

---

**End of Backlog**
