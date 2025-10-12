# Sales Grid System Documentation

## Overview

The Sales Grid System provides a responsive, enterprise-grade layout for displaying sales cards. It replaces the previous problematic inline-styled grid with a robust, testable, and maintainable solution.

## Architecture

### Components

- **`SalesGrid`**: Main grid container component
- **`LayoutDiagnostic`**: Development debugging tool
- **`SaleCard`**: Individual sale card component

### CSS Classes

- **`.sales-grid`**: Main grid container
- **`.sales-grid-item`**: Grid item wrapper
- **`.sale-row`**: Individual sale card styling

## Usage

### Basic Implementation

```tsx
import SalesGrid from '@/components/SalesGrid'

<SalesGrid 
  sales={salesArray} 
  authority="MAP" 
  isLoading={false}
  className="custom-class"
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `sales` | `Sale[]` | `[]` | Array of sale objects to display |
| `authority` | `'MAP' \| 'FILTERS'` | - | Authority mode for styling |
| `isLoading` | `boolean` | `false` | Show loading skeletons |
| `className` | `string` | `''` | Additional CSS classes |

## Responsive Behavior

### Breakpoints

- **Mobile (< 640px)**: 1 column
- **Tablet (640px - 1024px)**: 2 columns  
- **Desktop (> 1024px)**: 3 columns

### CSS Custom Properties

```css
.sales-grid {
  --grid-columns: 1;        /* Number of columns */
  --grid-gap: 1.5rem;       /* Gap between items */
  --grid-min-item-width: 280px; /* Minimum item width */
}
```

## Testing

### Unit Tests

```bash
npm test tests/components/SalesGrid.test.tsx
```

### Test Coverage

- Grid rendering
- Responsive behavior
- Loading states
- Data attributes
- Custom classes

### Visual Regression Tests

```bash
npm run test:visual
```

## Debugging

### Development Tools

The `LayoutDiagnostic` component provides real-time debugging:

- Container dimensions
- Computed styles
- CSS class analysis
- Hydration state
- Responsive breakpoints

### Common Issues

1. **Single Column Display**
   - Check for conflicting CSS
   - Verify responsive breakpoints
   - Ensure proper container width

2. **Layout Shifts**
   - Check for hydration mismatches
   - Verify skeleton loading states
   - Ensure consistent item heights

3. **Performance Issues**
   - Monitor ResizeObserver usage
   - Check for unnecessary re-renders
   - Verify proper cleanup

## Migration Guide

### From Legacy Grid

1. Replace inline styles with `SalesGrid` component
2. Remove conflicting CSS classes
3. Update tests to use new component
4. Verify responsive behavior

### Breaking Changes

- Inline `gridTemplateColumns` styles removed
- Tailwind responsive classes replaced with CSS custom properties
- Grid item structure changed (now wrapped in `.sales-grid-item`)

## Performance Considerations

### Optimization Strategies

1. **ResizeObserver**: Efficiently tracks container size changes
2. **CSS Custom Properties**: Minimal re-calculations
3. **Skeleton Loading**: Prevents layout shifts
4. **Lazy Loading**: Only render visible items

### Best Practices

1. Use `SalesGrid` component instead of manual grid implementation
2. Avoid inline styles on grid containers
3. Test responsive behavior across breakpoints
4. Monitor performance with large datasets

## Troubleshooting

### Grid Not Displaying

1. Check container has proper width
2. Verify CSS is loaded
3. Ensure no conflicting styles
4. Check browser dev tools for computed styles

### Responsive Issues

1. Verify breakpoint calculations
2. Check container width constraints
3. Ensure proper CSS media queries
4. Test with different screen sizes

### Performance Issues

1. Monitor ResizeObserver usage
2. Check for memory leaks
3. Verify proper cleanup
4. Profile rendering performance

## Future Enhancements

### Planned Features

1. **Virtual Scrolling**: For large datasets
2. **Animation Support**: Smooth transitions
3. **Accessibility**: Enhanced screen reader support
4. **Theme Support**: Dark/light mode variants

### API Improvements

1. **Custom Breakpoints**: User-defined responsive points
2. **Dynamic Columns**: Runtime column adjustment
3. **Grid Templates**: Predefined layout patterns
4. **Animation Hooks**: Custom transition effects
