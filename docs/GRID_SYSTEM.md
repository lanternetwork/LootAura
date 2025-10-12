# Enterprise-Grade Responsive Grid System

This document outlines the design, implementation, and usage of the new responsive grid system for displaying sales listings. The goal is to provide a robust, flexible, and performant solution that addresses previous layout issues, hydration mismatches, and CSS conflicts.

---

## 1. Motivation & Root Cause Analysis

Previously, the sales list suffered from inconsistent layouts, often rendering as a single column instead of a responsive grid. The root causes were identified as:

- **CSS Conflict Cascade**: A mix of Tailwind utility classes, inline styles, and global CSS rules created a complex cascade where `!important` declarations often overrode desired responsive behavior.
- **Hydration Mismatch**: Differences in how styles were applied during server-side rendering (SSR) versus client-side hydration led to layout shifts and incorrect rendering.
- **Layout Hierarchy Problems**: The `SaleCard` component's internal `flex flex-col` styling conflicted when it was a direct child of a grid container, leading to unexpected rendering.
- **Lack of Centralized Control**: No single source of truth for grid definitions, making debugging and maintenance difficult.

---

## 2. Solution: `SalesGrid` Component

To address these issues, a new `SalesGrid` React component has been introduced, along with a dedicated CSS system and development guardrails.

### `components/SalesGrid.tsx`

This component acts as the primary container for displaying sales in a responsive grid.

**Key Features:**

- **Responsive Columns**: Dynamically adjusts the number of columns (1, 2, or 3) based on the `SalesGrid` container's actual width, not `window.innerWidth`.
- **`ResizeObserver`**: Utilizes the `ResizeObserver` API for efficient and performant monitoring of the container's size, triggering re-renders only when necessary. This avoids reliance on `window.innerWidth` which can be problematic with SSR and non-reactive updates.
- **CSS Custom Properties (CSS Variables)**: Uses `--grid-columns` and `--grid-gap` CSS variables to pass dynamic values to the CSS, allowing for flexible styling without inline style conflicts.
- **Clear Separation of Concerns**: The `SalesGrid` component manages the grid container logic, while individual `SaleCard` components (wrapped in `SalesGridItem` divs) handle their internal layout.
- **Loading State Handling**: Renders `SaleCardSkeleton` components when `loading` is true (and not in MAP authority mode), providing a smooth user experience.
- **Empty State Management**: Displays a customizable `emptyStateMessage` when no sales are present.

**Usage Example:**

```tsx
import SalesGrid from '@/components/SalesGrid';
import { Sale } from '@/lib/types';

// In SalesClient.tsx or similar
<SalesGrid
  sales={visibleSales}
  loading={loading}
  authority={arbiter.authority}
  emptyStateMessage={
    <div className="text-center py-16">
      <h3 className="text-xl font-semibold text-gray-800">No sales found.</h3>
      <p className="text-gray-500 mt-2">Try adjusting your filters.</p>
    </div>
  }
  skeletonCount={6}
/>
```

### `app/globals.css`

The global CSS file now defines the core styles for the `.sales-grid` and `.sales-grid-item` classes, leveraging CSS custom properties for dynamic values.

```css
/* Enterprise-grade responsive grid system */
.sales-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-columns, 1), 1fr); /* Default to 1 column */
  gap: var(--grid-gap, 1.5rem);
  width: 100%;
  min-height: 200px; /* Ensure minimum height for consistency */
}

.sales-grid-item {
  display: block; /* Ensure grid items behave as block-level elements */
  width: 100%;
  min-height: 200px; /* Ensure minimum height for consistency */
}

/* Responsive behavior based on container width (handled by JS in SalesGrid) */
/* These media queries are for illustrative purposes if CSS-only breakpoints were desired,
   but the SalesGrid component dynamically sets --grid-columns based on its own width.
   The data-columns attribute is used for debugging and potential future CSS-driven breakpoints. */
@media (min-width: 640px) {
  .sales-grid[data-columns="2"] {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .sales-grid[data-columns="3"] {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Skeleton loading styles (re-applied for consistency) */
.sale-skeleton {
  @apply rounded-xl border p-4 bg-white shadow-sm;
  min-height: 200px;
}
.skeleton-header { @apply h-6 bg-gray-200 rounded mb-2; }
.skeleton-content { @apply h-4 bg-gray-200 rounded mb-2; }
.skeleton-footer { @apply h-4 bg-gray-200 rounded w-3/4; }

/* Override any conflicting styles for SaleCard's root element */
.sale-row {
  width: 100% !important;
  max-width: none !important;
}

/* Legacy support - these rules should be removed once SalesClient fully migrates to SalesGrid */
[data-grid-container="true"] {
  display: grid !important;
  grid-template-columns: repeat(var(--grid-columns, 1), 1fr) !important;
  gap: 1.5rem !important;
  width: 100% !important;
  max-width: none !important;
  min-height: 200px !important;
}
.grid-item {
  display: block !important;
  width: 100% !important;
  min-height: 200px !important;
}
```

---

## 3. Development Guardrails

To prevent future regressions and ensure maintainability, the following guardrails have been implemented:

### `tests/components/SalesGrid.test.tsx`

A dedicated unit test suite for the `SalesGrid` component ensures:

- Correct rendering of sales cards, skeletons, and empty states.
- Accurate column calculation based on container width via `ResizeObserver` mocks.
- Proper cleanup of `ResizeObserver` on component unmount.

### `.eslintrc.grid-rules.js`

Custom ESLint rules have been introduced to enforce best practices and prevent common grid-related conflicts:

- **`no-inline-grid-styles`**: Disallows inline `display: grid` or `gridTemplateColumns` styles on the main grid container, promoting the use of `SalesGrid` or `app/globals.css`.
- **`no-direct-sale-card-grid-children`**: Ensures `SaleCard` components are not direct children of grid containers, preventing conflicts with their internal flex layout. They must be wrapped in a `SalesGridItem` (or the `SalesGrid` component's internal wrapper).

### `components/LayoutDiagnostic.tsx`

A new client-side component for real-time visual debugging of layout properties:

- Displays computed `display`, `gridTemplateColumns`, `width`, and `itemCount`.
- Shows applied `className` and `style` attributes for both the container and the first item.
- Uses `ResizeObserver` and `MutationObserver` to detect and report layout changes dynamically.
- Helps identify hydration mismatches or unexpected style overrides at runtime.

---

## 4. Migration & Next Steps

The next crucial step is to **integrate the new `SalesGrid` component into `SalesClient.tsx`** and remove all legacy grid-related code.

**Migration Plan for `SalesClient.tsx`:**

1. **Import `SalesGrid`**: Add `import SalesGrid from '@/components/SalesGrid';`
2. **Replace Grid Container**: Replace the existing `div` with `data-testid="sales-grid"` with the `SalesGrid` component.
3. **Pass Props**:
   - `sales`: Pass `visibleSales` (or `renderedSales` depending on authority).
   - `loading`: Pass the `loading` state.
   - `authority`: Pass `arbiter.authority`.
   - `emptyStateMessage`: Define appropriate empty state JSX.
   - `skeletonCount`: (Optional) Define number of skeletons.
4. **Remove Legacy Styling**: Delete all inline `style` attributes and Tailwind `grid-cols-*` classes from the replaced `div`.
5. **Remove Legacy Debugging**: Remove the old `GRID DEBUG` overlay.
6. **Remove `gridContainerRef`**: The `SalesGrid` component manages its own ref.
7. **Cleanup `app/globals.css`**: Remove the `[data-grid-container="true"]` and `.grid-item` legacy rules once `SalesClient` is fully migrated.

This structured approach ensures a robust, maintainable, and performant grid layout for the sales list, with clear guardrails against future regressions.