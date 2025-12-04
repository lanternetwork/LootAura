# Webapp UX & Feature Polish Audit (LootAura)

**Date:** December 2024  
**Scope:** Next.js app UI, map experience, filters, responsive behavior, accessibility, and micro-interactions  
**Method:** Read-only codebase scan

---

## 1. Map Experience

### 1.1 Main Map Components

**Primary Route:** `app/sales/page.tsx` → `app/sales/SalesClient.tsx`

**Core Map Component:** `components/location/SimpleMap.tsx`
- Built on `react-map-gl` (Mapbox GL JS wrapper)
- Supports both `pins` (legacy clustering) and `hybridPins` (new hybrid clustering system)
- Handles viewport changes, drag events, and centering animations
- Supports `fitBounds` for programmatic zoom-to-area

**Mobile Map Shell:** `app/sales/MobileSalesShell.tsx`
- Full-screen map on mobile with bottom sheet for sale details
- Toggle between map and list views
- Floating action buttons for filters and list toggle

**Desktop Layout:** `app/sales/SalesClient.tsx`
- Side-by-side layout: map (left) + sales list (right)
- Grid layout: `md:grid-cols-[minmax(0,1fr)_420px]` (map takes remaining space, list fixed 420px)
- Desktop callout card positioned relative to selected pin

### 1.2 Map UX Features

#### Panning & Zoom Behavior
- **Smooth transitions:** `fitBounds` with 300ms duration, configurable padding
- **Zoom limits:** `maxZoom: 15` prevents over-zooming on `fitBounds`
- **Viewport sync:** Map viewport state (`center`, `zoom`, `bounds`) is single source of truth
- **Debounced updates:** Viewport changes trigger debounced sales fetching (500ms delay)

#### Marker Clustering
- **Hybrid clustering system:** `lib/pins/hybridClustering.ts` + `components/location/HybridPinsOverlay.tsx`
- **Cluster markers:** `components/location/ClusterMarker.tsx` with count badges
- **De-clustering:** Clicking cluster zooms in and expands to show individual pins
- **Visual feedback:** Selected pin highlighted, clusters show count

#### Sale Selection & Highlighting
- **Selected pin state:** `selectedPinId` tracks currently selected sale
- **Visual highlighting:** Selected pin uses different styling (likely via `hybridPins.selectedId`)
- **Desktop callout:** Small card appears near selected pin with sale preview
- **Mobile callout:** `components/sales/MobileSaleCallout.tsx` - compact card at bottom or positioned near pin

#### List ↔ Map Synchronization
- **Map-as-source-of-truth:** List shows sales visible in current viewport bounds
- **Viewport filtering:** `filterSalesForViewport()` filters sales by current map bounds
- **Hybrid result:** Combines viewport-filtered sales with distance-based results
- **Click-to-center:** Clicking sale in list centers map on that sale's location

### 1.3 Map Interactions

#### Clicking a Marker
- **Desktop:** Opens callout card positioned near pin, centers map on sale
- **Mobile:** Opens bottom callout card with sale preview, "View Sale" button, navigation link
- **Behavior:** `onLocationClick` handler updates `selectedPinId`, triggers centering animation

#### Hovering a Marker
- **Not implemented:** No hover tooltips or previews on marker hover
- **Desktop callout:** Only appears on click, not hover

#### Clicking a Sale in List
- **Behavior:** Centers map on sale location, highlights pin
- **URL preservation:** Detail page links include viewport params (`?lat=&lng=&zoom=`) to restore map view on back

### 1.4 Visual Feedback

#### Loading States
- **Map loading:** `components/location/MapLoadingIndicator.tsx` - spinner with "Loading map..." text
- **Sales fetching:** No explicit loading indicator during viewport-based fetching (relies on list skeletons)
- **Location permission:** `components/location/UseLocationButton.tsx` shows spinner during geolocation request

#### Empty States
- **No results message:** Not explicitly implemented for map viewport
- **List empty state:** `components/EmptyState.tsx` used in list when no sales match filters
- **"No sales in this area":** Not present - map just shows no pins

### 1.5 Map Controls & Affordances

#### "Use My Location" Button
- **Component:** `components/location/UseLocationButton.tsx`
- **Features:** 
  - Requests browser geolocation
  - Shows loading spinner during request
  - Displays error message if permission denied or location unavailable
  - Centers map on user location when successful
- **Location:** Present in hero search (`components/landing/HeroSearchBar.tsx`)

#### "Re-center" / "Search This Area"
- **Not implemented:** No explicit "Re-center" or "Refresh for this view" button
- **Auto-refresh:** Map automatically fetches sales when viewport changes (debounced)

#### Map Controls
- **Zoom buttons:** Provided by Mapbox GL JS (default controls)
- **Reset:** No explicit "Reset to default view" button
- **Attribution:** OSM attribution overlay (`components/location/AttributionOSM.tsx`) positioned configurable (top-right, bottom-right, etc.)

#### ZIP/City Search
- **Hero search:** `components/landing/HeroSearchBar.tsx` - geocodes city/ZIP and navigates to map
- **URL parameter:** `?zip=` parameter triggers client-side geocoding if not resolved server-side
- **Fallback:** Falls back from ZIP validation to city name geocoding (`/api/geocoding/suggest`)

---

## 2. Filters & List UX

### 2.1 Filter Components

**Main Filter Modal:** `components/filters/FiltersModal.tsx`
- **Mobile:** Bottom sheet modal (slides up from bottom)
- **Desktop:** Sidebar panel (when `isOpen={true}`)
- **Trigger:** `components/filters/FilterTrigger.tsx` - button showing active filter count badge

**Filter Types:**
1. **Distance Filter** (`distance`)
   - Dropdown select: 5, 10, 15, 20, 25, 30, 40, 50, 75, 100 miles
   - Default: 25 miles
   - Validation: Clamped between 1-100 miles

2. **Date Range Filter** (`dateRange`)
   - Component: `components/filters/DateSelector.tsx`
   - Options: "Any", "Today", "This Weekend", "Next Weekend", "Custom Range"
   - Custom range: Start/end date pickers

3. **Categories Filter** (`categories`)
   - Multi-select checkboxes
   - Grid layout: `grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3`
   - Categories from `lib/data/categories.ts` (CATEGORIES constant)
   - Visual: Selected categories have blue border + blue-50 background

### 2.2 Filter UX Features

#### Clear-All
- **Desktop:** "Clear All" button in filter header (only shown when `hasActiveFilters`)
- **Mobile:** "Clear All" button in filter content
- **Behavior:** Resets distance to 25, dateRange to "any", categories to []

#### Per-Filter Reset
- **Not implemented:** No individual "X" buttons on each filter
- **Workaround:** Users must manually deselect categories, change date back to "Any", etc.

#### "X Filters Applied" Indicator
- **Filter trigger badge:** `components/filters/FilterTrigger.tsx` shows count badge when filters active
- **Active filters summary:** `FiltersModal` shows list of active filters at bottom:
  - "Distance: X miles" (if not 25)
  - "Date: Today/This Weekend/etc." (if not "any")
  - "Categories: X selected" (if any selected)

#### Filter Validation & Limits
- **Distance:** Clamped 1-100 miles (validated in `useFilters` hook)
- **Date range:** No explicit validation for past dates or invalid ranges
- **Categories:** No limit on number of categories selected

### 2.3 Sales List

#### Rendering
- **Component:** `components/SalesList.tsx` (legacy) + `components/SalesGrid.tsx` (grid layout)
- **Card component:** `components/SaleCard.tsx`
- **Layout:** 
  - Desktop: Fixed-width sidebar (420px on md, 480px on xl, 540px on 2xl)
  - Mobile: Full-width list below map (when in list mode)

#### Sale Card Features
- **Cover image:** Uses `getSaleCoverUrl()` - falls back to `SalePlaceholder` SVG if no image
- **Title:** Line-clamped to 1 line
- **Description:** Line-clamped to 1 line (if present)
- **Address:** Clickable `AddressLink` component (opens Google Maps)
- **Date/time:** Formatted with `toLocaleString()`
- **Price:** Displayed in amber color if present
- **Favorite button:** `components/FavoriteButton.tsx` - heart icon, optimistic UI
- **"View Details" link:** Navigates to `/sales/[id]` with viewport params preserved

#### Visual Cues
- **"Demo" badge:** Shows amber badge if `sale.is_demo === true` or ID starts with "demo-"
- **Distance badges:** Not shown on cards (distance calculated server-side, not displayed)
- **Date/time chips:** Plain text, no special styling for "ending soon" or "new"
- **"Popular" / "New" indicators:** Not implemented

#### Empty State Behavior
- **Component:** `components/EmptyState.tsx`
- **Default message:** "No Sales Found"
- **Customizable:** Accepts `title` and `cta` props
- **Usage in SearchResults:** Shows contextual message:
  - "No sales match your filters" (if filters active)
  - "No sales found" (if no filters)
  - Includes CTA: "Post the first sale →" (links to `/explore?tab=add`)

#### Loading States
- **Skeleton component:** `components/SaleCardSkeleton.tsx`
  - Animated pulse effect
  - Mimics card layout (image placeholder, title, description, price)
  - Min-height: 160px
- **Progressive loader:** `components/ProgressiveLoader.tsx`
  - Shows skeletons after delay (configurable, default 0ms)
  - Fade-in animation when content loads
- **Usage:** 
  - `SalesGrid` shows skeletons when `loading={true}`
  - `SalesList` shows skeletons during initial load
  - Map screen shows skeletons in list sidebar during fetch

---

## 3. Loading, Empty & Error States

### 3.1 Loading UI Components

#### Skeletons
- **SaleCardSkeleton:** `components/SaleCardSkeleton.tsx`
  - Used for: Sales list, grid, and detail page previews
- **ProgressiveLoader:** `components/ProgressiveLoader.tsx`
  - Wrapper component that shows skeletons during loading
  - Configurable delay before showing skeleton
  - Fade-in animation when content appears

#### Spinners
- **MapLoadingIndicator:** `components/location/MapLoadingIndicator.tsx`
  - Spinner + "Loading map..." text
  - Positioned top-left on map
- **UseLocationButton:** Shows spinner during geolocation request
- **Generic spinners:** Used in `SearchResults.tsx` ("Searching sales...") and `VirtualizedSalesList.tsx` ("Loading sales...")

#### Where Skeletons Are Used
- **Map screen:** Sales list sidebar shows skeletons during initial load and viewport changes
- **Sale detail:** Not explicitly implemented (relies on Next.js `loading.jsx` for route-level loading)
- **Profile:** `app/(public)/u/[username]/page.tsx` has `ListingSkeleton` and `ProfileSkeleton` components
- **Favorites:** Not explicitly checked, but likely uses `SaleCardSkeleton` in list

#### Slow Operations
- **Search:** `SearchResults.tsx` shows spinner with "Searching sales..." message
- **Viewport changes:** No explicit loading indicator (relies on list skeletons)
- **Cron-driven views:** Not applicable (cron runs server-side)

### 3.2 Empty States

#### Lists
- **Sales list:** `components/EmptyState.tsx` - "No Sales Found" with optional CTA
- **Search results:** `components/SearchResults.tsx` - Contextual message based on filters
- **Favorites:** Not explicitly checked (likely uses `EmptyState` component)
- **Reviews:** Not explicitly checked

#### Empty State Features
- **Illustrations:** Uses emoji (🔎) instead of SVG illustrations
- **Helpful CTAs:**
  - "Post the first sale →" (links to create sale page)
  - "Try adjusting your search criteria or clearing some filters" (when filters active)
- **"Zoom out" / "Change filters":** Not explicitly suggested in empty states

### 3.3 Error UI Components

#### Error Boundaries
- **Global error boundary:** `components/system/ErrorBoundary.tsx`
  - Catches React render errors
  - Shows fallback UI: "Something Went Wrong" with error message
  - "Try Again" button (resets error state)
  - "Go Home" link
  - Logs to Sentry in production
- **Route-level:** `app/error.jsx` (Next.js error boundary)

#### User-Facing Errors
- **Toasts:** `components/sales/Toast.tsx`
  - Fixed bottom-right position
  - Auto-dismisses after 3 seconds (configurable)
  - Close button with ARIA label
  - Used in: Sale creation (`SellWizardClient`), favorite toggles (via `toast.success/error`)

#### Error Messages
- **Form validation:** Inline error messages in forms (e.g., `AddSaleForm`, `SellWizardClient`)
- **API errors:** Generic "Something went wrong" messages (sanitized via `lib/errors/sanitize.ts`)
- **User-friendly copy:** 
  - "Failed to delete sale. Please refresh the page." (DashboardSaleCard)
  - "Please sign in to save favorites" (FavoriteButton redirects to login)
  - "Location not found" (ZIP search error)

#### Error Banners
- **DegradedBanner:** `components/DegradedBanner.tsx` (not explicitly checked for usage)
- **OfflineBanner:** `components/OfflineBanner.tsx` - shows when offline, displays cached count
- **No generic error banners:** Errors primarily shown via toasts or inline messages

---

## 4. Responsive & Mobile UX

### 4.1 Breakpoints & Layout Behavior

#### Breakpoints (Tailwind)
- **sm:** 640px
- **md:** 768px (tablet/desktop split)
- **lg:** 1024px
- **xl:** 1280px
- **2xl:** 1536px

#### Map + List Layout
- **Mobile (< 768px):**
  - Full-screen map with toggle to switch to list view
  - Bottom sheet for sale details (`MobileSaleCallout`)
  - Filters in bottom sheet modal
- **Desktop (≥ 768px):**
  - Side-by-side: Map (flex-1) + List (fixed 420px on md, 480px on xl, 540px on 2xl)
  - Filters in sidebar (when open)
  - Desktop callout card positioned near selected pin

#### Filter Layout
- **Mobile:** Bottom sheet modal (`FiltersModal` with `lg:hidden`)
- **Desktop:** Sidebar panel (`hidden md:block`)

### 4.2 Mobile-Specific UX

#### Bottom Sheets & Drawers
- **MobileSaleCallout:** Compact card at bottom or positioned near pin
  - Swipe-to-dismiss gesture support
  - Platform detection (iOS/Android) for navigation URLs
  - "View Sale" button + navigation button
- **FiltersModal:** Bottom sheet on mobile, slides up from bottom
- **No full-screen drawers:** Sale details open in new page, not bottom sheet

#### Touch Affordances
- **Tap targets:** 
  - Buttons have `min-h-[44px]` (meets iOS/Android guidelines)
  - Category checkboxes: `min-h-[44px]` in `FiltersModal`
- **Swipe gestures:**
  - `MobileSaleCallout` supports swipe-down to dismiss
  - Drag handle indicator (gray bar) when at bottom
- **Pin interactions:**
  - Tap pin to select (centers map, shows callout)
  - Tap map to deselect (closes callout)

#### Mobile Navigation
- **Platform-specific navigation:**
  - iOS: Apple Maps URL scheme
  - Android: Google Maps intent
  - Desktop: Google Maps web URL
  - Detection via `detectPlatform()` in `MobileSaleCallout`

### 4.3 Known Gaps

#### Desktop-Only Features
- **Hard-coded widths:** List sidebar has fixed widths (420px, 480px, 540px) - may not adapt well to very wide screens
- **Overflow issues:** Not explicitly checked, but fixed-width sidebars could cause issues on small desktop windows

#### Mobile Layout TODOs
- **No explicit TODOs found** in code comments
- **Map controls:** Zoom buttons provided by Mapbox (may be small on mobile)

---

## 5. Accessibility & Keyboard UX

### 5.1 Accessibility Features

#### ARIA Attributes
- **Map region:** `role="region"` with `aria-label="Interactive map showing yard sales locations"` (SalesClient)
- **Buttons:** 
  - `aria-label` on close buttons ("Close toast", "Close", "Cancel delete", "Confirm delete")
  - `aria-pressed` on favorite buttons (tested in E2E tests)
- **Form labels:** 
  - `AddSaleForm` has proper `label` elements with `htmlFor` attributes
  - Test coverage: `tests/components/AddSaleForm.a11y.test.tsx` verifies all inputs have labels
- **Skip link:** `components/a11y/SkipToContent.tsx`
  - Screen-reader-only link that appears on focus
  - Jumps to `#main-content` with smooth scroll

#### Semantic HTML
- **Sale cards:** `<article>` elements with `data-testid="sale-card"`
- **Headings:** Proper heading hierarchy (h1, h2, h3) in components
- **Lists:** `<ul>` / `<li>` for category lists, filter summaries

#### Screen-Reader Helpers
- **sr-only class:** Used in `SkipToContent` (`sr-only focus:not-sr-only`)
- **ARIA labels:** Present on interactive elements (buttons, links, form inputs)

### 5.2 Keyboard UX

#### Map Navigation
- **Cluster markers:** Keyboard accessible (`tabIndex={0}`, Enter/Space to activate)
  - Test coverage: `tests/a11y/map.cluster-a11y.test.tsx`
  - ARIA label: "Cluster of X sales. Press Enter to zoom in."
- **Pin markers:** `role="button"`, `tabIndex={0}`, `aria-label` with sale title
- **Map controls:** Provided by Mapbox GL JS (keyboard accessible by default)

#### Focus Management
- **Modals:** 
  - `ConfirmationModal` handles ESC key to close
  - Body scroll locked when modal open
  - Not explicitly focus-trapped (may be handled by Mapbox or browser default)
- **Forms:** Standard tab order (no custom focus management found)

#### Keyboard Shortcuts
- **Not implemented:** No custom keyboard shortcuts for search, filters, or navigation
- **Browser defaults:** Standard form navigation (Tab, Enter, Space)

### 5.3 Known Accessibility TODOs

#### Code Comments
- **No explicit a11y TODOs found** in scanned files
- **Test coverage:** Extensive a11y tests in `tests/a11y/` and `tests/components/AddSaleForm.a11y.test.tsx`

#### Potential Gaps
- **Map interactions:** Keyboard navigation of map pins may be limited (Mapbox default behavior)
- **Focus indicators:** Not explicitly checked, but Tailwind focus styles (`focus:ring-2`) are used
- **Color contrast:** Not explicitly verified (relies on Tailwind defaults)

---

## 6. Micro-UX: Toasts, Confirmations, Hints

### 6.1 Toast / Notification System

#### Toast Component
- **Component:** `components/sales/Toast.tsx`
- **Features:**
  - Fixed position: bottom-right (`fixed bottom-4 right-4 z-50`)
  - Auto-dismiss: 3 seconds (configurable `duration` prop)
  - Close button with ARIA label
  - Dark theme: `bg-gray-900 text-white`
- **Usage:**
  - Sale creation success/error (`SellWizardClient`)
  - Favorite toggles (via `toast.success/error` - likely from `react-hot-toast` or similar)

#### Toast Usage Locations
- **Sale creation:** `SellWizardClient` shows toast for errors
- **Favorite toggles:** `FavoriteButton` uses optimistic UI, no explicit toast (may use library)
- **Dashboard actions:** `DashboardSaleCard` uses `toast.success/error` for delete actions
- **Profile updates:** Not explicitly checked

#### Message Quality
- **User-friendly:** "Sale deleted successfully", "Failed to delete sale. Please refresh the page."
- **Actionable:** Some messages include next steps ("Please refresh the page")

### 6.2 Confirmation Flows

#### Delete Sale
- **Component:** `components/dashboard/DashboardSaleCard.tsx`
- **Modal:** Inline confirmation dialog (not separate component)
- **Message:** "Are you sure you want to delete '{sale.title}'? This action cannot be undone."
- **Actions:** Cancel (closes modal) + Delete (red button, shows "Deleting..." during request)
- **Optimistic UI:** Sale removed from UI immediately, reverted on error

#### Delete Listing (Profile)
- **Component:** `components/profile/OwnerListingsTabs.tsx`
- **Modal:** Similar inline confirmation dialog
- **Message:** "Are you sure you want to delete this listing? This action cannot be undone."
- **Actions:** Cancel + Delete (red button)

#### Delete Item
- **Not explicitly checked:** Item deletion may not have confirmation (needs verification)

#### Remove Favorite
- **No confirmation:** `FavoriteButton` toggles immediately (optimistic UI)

### 6.3 Tooltips & Hints

#### Tooltips
- **Not implemented:** No tooltip system found (no `Tooltip` component or library like Radix Tooltip)
- **Title attributes:** Some elements use `title` attribute (e.g., cluster markers: "Cluster of X sales")

#### Inline Hints
- **Filter help text:** 
  - Distance filter: Commented-out hint "Currently using map view" (not shown)
  - Date selector: Debug info shown in dev mode (`JSON.stringify(filters.dateRange)`)
- **Form hints:** Not explicitly checked (may be in `AddSaleForm` or `SellWizardClient`)

#### Missing Tooltips
- **Filter controls:** No tooltips explaining what each filter does
- **Map behaviors:** No hints about clustering, pin interactions, or viewport syncing
- **Rating rules:** Not applicable (no rating system in scanned files)

---

## 7. Summary & Recommended Next Targets

### 7.1 What's Already Polished

#### Strong Areas
1. **Map Experience:**
   - Smooth viewport syncing between map and list
   - Hybrid clustering system with visual feedback
   - Mobile-optimized callout cards with swipe gestures
   - Platform-specific navigation URLs (iOS/Android/Desktop)
   - Viewport preservation in URLs for back navigation

2. **Filter System:**
   - Comprehensive filter modal (distance, date, categories)
   - Active filter summary and clear-all functionality
   - Responsive design (bottom sheet on mobile, sidebar on desktop)
   - URL parameter syncing for shareable filter states

3. **Loading States:**
   - Skeleton components for sales cards
   - Progressive loading with fade-in animations
   - Map loading indicator
   - Geolocation request feedback

4. **Accessibility:**
   - Extensive a11y test coverage
   - ARIA labels on interactive elements
   - Skip-to-content link
   - Keyboard-accessible cluster markers
   - Semantic HTML structure

5. **Error Handling:**
   - Global error boundary with user-friendly fallback
   - Toast notifications for user actions
   - Confirmation modals for destructive actions
   - Optimistic UI with rollback on error

### 7.2 Where Gaps Are Obvious

#### Missing Features
1. **Map Empty States:**
   - No "No sales in this area" message when viewport has no results
   - No suggestion to "Zoom out" or "Try a different location"

2. **Filter UX:**
   - No per-filter reset buttons (must manually clear each)
   - No tooltips explaining filter behaviors
   - Debug info visible in production (date range JSON in FiltersModal)

3. **Loading Feedback:**
   - No explicit loading indicator during viewport-based sales fetching (relies on list skeletons)
   - No progress indicators for slow operations

4. **Visual Cues:**
   - No "New", "Popular", or "Ending soon" badges on sale cards
   - No distance badges on cards (distance calculated but not displayed)
   - No hover tooltips on map markers

5. **Keyboard Shortcuts:**
   - No custom shortcuts for common actions (search, filters, navigation)

6. **Tooltips:**
   - No tooltip system for explaining UI behaviors
   - Limited use of `title` attributes for hover hints

7. **Mobile Optimizations:**
   - Sale details open in new page (not bottom sheet) - may break mobile flow
   - Fixed-width list sidebar may not adapt well to very wide/narrow desktop windows

### 7.3 Recommended Next Polish Targets

#### High-Impact, Low-Effort
1. **Add "No sales in this area" empty state to map**
   - Show message when viewport has no results
   - Include CTAs: "Zoom out", "Try a different location", "Clear filters"
   - **File:** `app/sales/SalesClient.tsx` or `components/location/SimpleMap.tsx`

2. **Remove debug info from FiltersModal**
   - Remove `JSON.stringify(filters.dateRange)` debug output
   - **File:** `components/filters/FiltersModal.tsx` (line 333-335)

3. **Add per-filter reset buttons**
   - Add "X" button to each active filter (distance, date, categories)
   - **File:** `components/filters/FiltersModal.tsx`

4. **Add loading indicator for viewport-based fetching**
   - Show subtle spinner or "Loading sales..." message during debounced fetch
   - **File:** `app/sales/SalesClient.tsx` (near `fetchMapSales` call)

5. **Add distance badges to sale cards**
   - Display calculated distance (if available) as badge on card
   - **File:** `components/SaleCard.tsx`

#### Medium-Impact, Medium-Effort
6. **Implement tooltip system**
   - Add tooltip component (e.g., Radix Tooltip or custom)
   - Add tooltips to: filter controls, map markers, favorite button
   - **Files:** New `components/ui/Tooltip.tsx`, update filter/map components

7. **Add "Ending soon" / "New" badges**
   - Calculate "ending soon" (within 24 hours) and "new" (created < 7 days)
   - Display as badges on sale cards
   - **File:** `components/SaleCard.tsx`

8. **Improve mobile sale detail flow**
   - Consider bottom sheet for sale details on mobile (instead of full page)
   - Or add "Back to map" button with viewport restoration
   - **Files:** `app/sales/[id]/SaleDetailClient.tsx`, new mobile detail component

9. **Add keyboard shortcuts**
   - `/` to focus search, `Esc` to close modals (already implemented in ConfirmationModal)
   - `?` to show keyboard shortcuts help
   - **Files:** New `lib/keyboard/shortcuts.ts`, update layout components

#### Lower Priority
10. **Add hover tooltips on map markers**
    - Show sale title + address on marker hover (desktop only)
    - **File:** `components/location/HybridPinsOverlay.tsx` or pin components

11. **Improve responsive list sidebar**
    - Make sidebar width responsive to viewport (use `clamp()` or percentage)
    - **File:** `app/sales/SalesClient.tsx` (grid layout classes)

12. **Add "Re-center" button**
    - Button to reset map to user's location or default view
    - **File:** `components/location/SimpleMap.tsx` or map controls overlay

---

## Appendix: File Reference

### Key Files Scanned
- `app/sales/SalesClient.tsx` - Main map + list orchestrator
- `app/sales/MobileSalesShell.tsx` - Mobile map layout
- `components/location/SimpleMap.tsx` - Core map component
- `components/filters/FiltersModal.tsx` - Filter UI
- `components/SaleCard.tsx` - Sale card component
- `components/EmptyState.tsx` - Empty state component
- `components/sales/Toast.tsx` - Toast notification
- `components/system/ErrorBoundary.tsx` - Error boundary
- `components/a11y/SkipToContent.tsx` - Skip link
- `components/sales/MobileSaleCallout.tsx` - Mobile sale preview

### Test Files Referenced
- `tests/a11y/map.cluster-a11y.test.tsx` - Cluster marker accessibility
- `tests/components/AddSaleForm.a11y.test.tsx` - Form accessibility
- `tests/e2e/complete-flow.spec.ts` - E2E accessibility tests

---

**End of Audit**

