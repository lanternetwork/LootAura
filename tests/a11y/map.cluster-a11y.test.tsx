import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ClusterMarker from '@/components/location/ClusterMarker'
import { ClusterResult } from '@/lib/clustering'

describe('Cluster Marker Accessibility', () => {
  const mockCluster: ClusterResult = {
    type: 'cluster',
    id: 'cluster-1',
    count: 5,
    lon: -85.7585,
    lat: 38.2527
  }

  const mockPoint: ClusterResult = {
    type: 'point',
    id: 'point-1',
    lon: -85.7585,
    lat: 38.2527
  }

  beforeEach(() => {
    // Mock react-map-gl Marker
    vi.mock('react-map-gl', () => ({
      Marker: ({ children, ...props }: any) => <div data-testid="marker" {...props}>{children}</div>
    }))
  })

  it('should render cluster marker with proper ARIA attributes', () => {
    const onClick = vi.fn()
    
    render(
      <ClusterMarker
        cluster={mockCluster}
        onClick={onClick}
        size="medium"
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
        size="medium"
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
        size="medium"
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
        size="medium"
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-blue-500')
  })

  it('should show cluster count', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
        size="medium"
      />
    )

    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('should apply correct size classes', () => {
    const { rerender } = render(
      <ClusterMarker
        cluster={mockCluster}
        size="small"
      />
    )

    let button = screen.getByRole('button')
    expect(button).toHaveClass('w-8', 'h-8', 'text-xs')

    rerender(
      <ClusterMarker
        cluster={mockCluster}
        size="medium"
      />
    )

    button = screen.getByRole('button')
    expect(button).toHaveClass('w-10', 'h-10', 'text-sm')

    rerender(
      <ClusterMarker
        cluster={mockCluster}
        size="large"
      />
    )

    button = screen.getByRole('button')
    expect(button).toHaveClass('w-12', 'h-12', 'text-base')
  })

  it('should have high contrast colors', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
        size="medium"
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-blue-600', 'text-white', 'border-white')
  })

  it('should handle hover states', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
        size="medium"
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveClass('hover:bg-blue-700', 'hover:shadow-xl')
  })

  it('should not render for point markers', () => {
    render(
      <ClusterMarker
        cluster={mockPoint}
        size="medium"
      />
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('should have proper semantic structure', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
        size="medium"
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('type', 'button')
    expect(button).toBeInTheDocument()
  })

  it('should support screen reader navigation', () => {
    render(
      <ClusterMarker
        cluster={mockCluster}
        size="medium"
      />
    )

    const button = screen.getByRole('button')
    
    // Should be focusable
    expect(button).toHaveAttribute('tabIndex', '0')
    
    // Should have descriptive text
    expect(button).toHaveAccessibleName('Cluster of 5 sales. Press Enter to zoom in.')
  })

  it('should handle different cluster sizes', () => {
    const largeCluster: ClusterResult = {
      type: 'cluster',
      id: 'cluster-2',
      count: 100,
      lon: -85.7585,
      lat: 38.2527
    }

    render(
      <ClusterMarker
        cluster={largeCluster}
        size="large"
      />
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'Cluster of 100 sales. Press Enter to zoom in.')
    expect(screen.getByText('100')).toBeInTheDocument()
  })
})
