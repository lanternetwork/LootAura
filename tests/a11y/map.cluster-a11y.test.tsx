import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ClusterMarker from '@/components/location/ClusterMarker'
import { ClusterFeature } from '@/lib/pins/types'

describe('Cluster Marker Accessibility', () => {
  const mockCluster: ClusterFeature = {
    id: 1,
    count: 5,
    lng: -85.7585,
    lat: 38.2527,
    expandToZoom: 12
  }

  const mockPoint: ClusterFeature = {
    id: 2,
    count: 1,
    lng: -85.7585,
    lat: 38.2527,
    expandToZoom: 12
  }

  beforeEach(() => {
    // Mock react-map-gl Marker
    vi.mock('react-map-gl', () => ({
      default: ({ children, ...props }: any) => <div data-testid="map" {...props}>{children}</div>,
      Marker: ({ children, ...props }: any) => <div data-testid="marker" {...props}>{children}</div>
    }))
  })

  it('should render cluster marker with proper ARIA attributes', () => {
    const onClick = vi.fn()
    
    render(
      <ClusterMarker
        cluster={mockCluster}
        onClick={onClick}
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'Cluster of 5 sales. Press Enter to zoom in.')
    expect(button).toHaveAttribute('title', 'Cluster of 5 sales')
    expect(button).toHaveAttribute('tabIndex', '0')
  })

  it('should be keyboard accessible', () => {
    const onClick = vi.fn()
    const onKeyDown = vi.fn()
    
    render(
      <ClusterMarker
        cluster={mockCluster}
        onClick={onClick}
        onKeyDown={onKeyDown}
      />
    )

    const button = screen.getByRole('button')
    
    // Test Enter key
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onKeyDown).toHaveBeenCalledWith(mockCluster, expect.any(Object))
    
    // Test Space key
    fireEvent.keyDown(button, { key: ' ' })
    expect(onKeyDown).toHaveBeenCalledWith(mockCluster, expect.any(Object))
  })

  it('should handle click events', () => {
    const onClick = vi.fn()
    
    render(
      <ClusterMarker
        cluster={mockCluster}
        onClick={onClick}
      />
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    
    expect(onClick).toHaveBeenCalledWith(mockCluster)
  })

  it('should have proper focus styles', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('focus:outline-none')
    expect(button).toHaveClass('focus:ring-2')
    expect(button).toHaveClass('focus:ring-blue-500')
  })

  it('should show cluster count', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
      />
    )

    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('should apply correct size classes', () => {
    // Test small size
    const { unmount: unmount1 } = render(
      <ClusterMarker
        cluster={mockCluster}
      />
    )

    let button = screen.getByRole('button')
    expect(button).toHaveClass('w-4')
    expect(button).toHaveClass('h-4')
    expect(button).toHaveClass('text-[10px]')
    unmount1()

    // Test medium size
    const { unmount: unmount2 } = render(
      <ClusterMarker
        cluster={mockCluster}
      />
    )

    button = screen.getByRole('button')
    expect(button).toHaveClass('w-5')
    expect(button).toHaveClass('h-5')
    expect(button).toHaveClass('text-[10px]')
    unmount2()

    // Test large size
    render(
      <ClusterMarker
        cluster={mockCluster}
      />
    )

    button = screen.getByRole('button')
    expect(button).toHaveClass('w-6')
    expect(button).toHaveClass('h-6')
    expect(button).toHaveClass('text-[11px]')
  })

  it('should have high contrast colors', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-blue-600')
    expect(button).toHaveClass('text-white')
    expect(button).toHaveClass('border-white')
  })

  it('should handle hover states', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('hover:bg-blue-700')
    expect(button).toHaveClass('hover:shadow-xl')
  })

  it('should not render for point markers', () => {
    render(
      <ClusterMarker
        cluster={mockPoint}
      />
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('should have proper semantic structure', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
      />
    )

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-label', 'Cluster of 5 sales. Press Enter to zoom in.')
  })

  it('should support screen reader navigation', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
      />
    )

    const button = screen.getByRole('button')
    
    // Should be focusable
    expect(button).toHaveAttribute('tabIndex', '0')
    
    // Should have descriptive text
    expect(button).toHaveAccessibleName('Cluster of 5 sales. Press Enter to zoom in.')
  })

  it('should handle different cluster sizes', () => {
    const largeCluster: ClusterFeature = {
      id: 2,
      count: 100,
      lng: -85.7585,
      lat: 38.2527,
      expandToZoom: 12
    }

    render(
      <ClusterMarker
        cluster={largeCluster}
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'Cluster of 100 sales. Press Enter to zoom in.')
    expect(screen.getByText('100')).toBeInTheDocument()
  })
})
