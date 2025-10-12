# Enterprise Grid System Documentation

## Overview

The LootAura sales list uses an enterprise-grade responsive grid system that ensures stable, multi-column layouts across all breakpoints while maintaining MAP authority and preventing layout regressions.

## Architecture

### Single Grid Container
- **One source of truth**: Single `div` with `data-testid="sales-grid"`
- **Direct children only**: Sale cards are direct children, no wrapper divs
- **Responsive classes**: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6`

### Column Authority
- **Tailwind breakpoints**: Uses literal Tailwind responsive classes
- **No JS calculations**: Avoids dynamic column computation
- **Safelist protection**: All grid classes are safelisted in `tailwind.config.ts`

### Arbiter Integration
- **MAP authority**: Grid maintains layout during map interactions
- **Latest-wins**: ViewportSeq/RequestSeq prevent stale updates
- **Suppression rules**: Wide fetches blocked under MAP authority

## Breakpoints

| Breakpoint | Width | Columns | Classes |
|------------|-------|---------|---------|
| Mobile | < 640px | 1 | `grid-cols-1` |
| Tablet | 640px - 1023px | 2 | `sm:grid-cols-2` |
| Desktop | ≥ 1024px | 3 | `lg:grid-cols-3` |

## Implementation

### Grid Container
```tsx
<div
  ref={gridContainerRef}
  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200"
  data-testid="sales-grid"
  {...(process.env.NEXT_PUBLIC_DEBUG === 'true' && { 'data-grid-debug': 'true' })}
>
  {/* Sale cards as direct children */}
</div>
```

### CSS Overrides (Debug Only)
```css
/* Only applied when NEXT_PUBLIC_DEBUG=true */
[data-grid-debug="true"] {
  display: grid !important;
  grid-template-columns: repeat(1, 1fr) !important;
  gap: 1.5rem !important;
  width: 100% !important;
  max-width: none !important;
}
```

## Testing

### Unit Tests
- **Class resolution**: `tests/unit/gridLayout.test.ts`
- **Arbiter sequencing**: `tests/unit/arbiter.test.ts`
- **Build-time checks**: `tests/build-time/css-tokens.test.ts`

### Integration Tests
- **Direct children**: `tests/integration/gridLayout.integration.test.tsx`
- **Loading states**: Grid maintains structure during transitions
- **Empty states**: No layout breaks with zero sales

### Snapshot Tests
- **Stable classes**: `tests/snapshots/gridContainer.snapshot.test.tsx`
- **Authority modes**: Consistent across MAP/FILTERS authority
- **Sale counts**: Stable with different data volumes

## Performance

### Targets
- **First paint**: ≤ 3s for interactive map
- **Query p95**: ≤ 300ms for visible sales
- **Bundle growth**: ≤ +5 KB gzip

### Optimizations
- **Pure CSS**: No JS-based column calculations
- **Debounced resize**: 100-150ms for any measurements
- **Stable keys**: Prevents unnecessary re-renders

## Security

### RLS Verification
- **Public read**: `yard_sales` table allows anonymous reads
- **Owner mutations**: Requires authenticated user
- **No PII leaks**: Debug logs gated by `NEXT_PUBLIC_DEBUG`

### Debug Gating
```typescript
if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
  console.log('[DEBUG] Grid diagnostic info')
}
```

## Maintenance

### Lint Rules
- **No inline styles**: Prevents grid overrides
- **No wrappers**: Enforces direct children
- **ESLint config**: `.eslintrc.grid-rules.js`

### CI Checks
- **Grid classes**: Build-time verification
- **Console warnings**: Fail on new warnings
- **Coverage**: Maintain test coverage

## Troubleshooting

### Common Issues
1. **Single column**: Check for conflicting CSS or missing Tailwind classes
2. **Wrapper divs**: Ensure SaleCard components are direct children
3. **Debug artifacts**: Remove `data-grid-debug` in production

### Debug Mode
Set `NEXT_PUBLIC_DEBUG=true` to enable:
- Grid diagnostic overlay
- Console logging
- CSS overrides for testing

## Migration Notes

### From Legacy System
- **Removed**: `[data-grid-container="true"]` CSS rules
- **Removed**: `.grid-item` wrapper classes
- **Added**: Comprehensive test coverage
- **Added**: Lint rules for prevention

### Breaking Changes
- Sale cards must be direct children of grid container
- No wrapper divs allowed around grid items
- Debug artifacts only available with `NEXT_PUBLIC_DEBUG=true`