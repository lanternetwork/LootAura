import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EmptyState from '@/components/EmptyState'

describe('EmptyState', () => {
  it('renders with default title', () => {
    render(<EmptyState />)
    
    expect(screen.getByText('No Sales Found')).toBeInTheDocument()
    expect(screen.getByText('🔎')).toBeInTheDocument()
  })

  it('renders with custom title', () => {
    render(<EmptyState title="No favorites yet" />)
    
    expect(screen.getByText('No favorites yet')).toBeInTheDocument()
    expect(screen.getByText('🔎')).toBeInTheDocument()
  })

  it('renders with custom CTA', () => {
    const cta = <button>Click me</button>
    render(<EmptyState title="Custom title" cta={cta} />)
    
    expect(screen.getByText('Custom title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('renders without CTA when not provided', () => {
    render(<EmptyState title="No CTA" />)
    
    expect(screen.getByText('No CTA')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('has correct structure', () => {
    render(<EmptyState title="Test" />)
    
    const container = screen.getByText('🔎').parentElement
    expect(container).toHaveClass('text-center')
    expect(container).toHaveClass('py-16')
    expect(container).toHaveClass('text-neutral-500')
  })
})
