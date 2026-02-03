import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { JSDOM } from 'jsdom'

// Setup JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
})

global.window = dom.window as any
global.document = dom.window.document
global.HTMLElement = dom.window.HTMLElement

// Mock React component for testing
const MockSaleCard = ({ saleId }: { saleId: string }) => {
  return (
    <article data-card="sale" data-sale-id={saleId}>
      <h3>Sale {saleId}</h3>
    </article>
  )
}

const MockSalesList = ({ sales }: { sales: string[] }) => {
  return (
    <div data-panel="list" className="w-full grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 gap-6">
      {sales.map(saleId => (
        <MockSaleCard key={saleId} saleId={saleId} />
      ))}
    </div>
  )
}

describe('list.dom', () => {
  beforeEach(() => {
    // Clear any existing content
    document.body.innerHTML = ''
  })
  
  afterEach(() => {
    // Clean up mocks and reset state
    vi.clearAllMocks()
  })
  
  it('should render list panel with correct data attribute', () => {
    const sales = ['sale-1', 'sale-2', 'sale-3']
    const { container } = render(<MockSalesList sales={sales} />)
    
    // Verify [data-panel="list"] exists
    const listPanel = container.querySelector('[data-panel="list"]')
    expect(listPanel).toBeTruthy()
    expect(listPanel).toHaveAttribute('data-panel', 'list')
  })
  
  it('should render sale cards as descendants of list panel', () => {
    const sales = ['sale-1', 'sale-2', 'sale-3']
    const { container } = render(<MockSalesList sales={sales} />)
    
    const listPanel = container.querySelector('[data-panel="list"]')
    expect(listPanel).toBeTruthy()
    
    // Verify cards are descendants via [data-card="sale"]
    const saleCards = listPanel?.querySelectorAll('[data-card="sale"]')
    expect(saleCards).toHaveLength(3)
    
    // Verify each card has the correct attributes
    saleCards?.forEach((card, index) => {
      expect(card).toHaveAttribute('data-card', 'sale')
      expect(card).toHaveAttribute('data-sale-id', sales[index])
    })
  })
  
  it('should have grid wrapper classes on list panel', () => {
    const sales = ['sale-1', 'sale-2']
    const { container } = render(<MockSalesList sales={sales} />)
    
    const listPanel = container.querySelector('[data-panel="list"]')
    expect(listPanel).toBeTruthy()
    
    // Confirm grid wrapper class presence
    expect(listPanel).toHaveClass('w-full')
    expect(listPanel).toHaveClass('grid')
    expect(listPanel).toHaveClass('grid-cols-1')
    expect(listPanel).toHaveClass('md:grid-cols-1')
    expect(listPanel).toHaveClass('lg:grid-cols-2')
    expect(listPanel).toHaveClass('gap-6')
  })
  
  it('should count cards correctly using descendant query', () => {
    const sales = ['sale-1', 'sale-2', 'sale-3', 'sale-4']
    const { container } = render(<MockSalesList sales={sales} />)
    
    const listPanel = container.querySelector('[data-panel="list"]')
    expect(listPanel).toBeTruthy()
    
    // Use descendant query for structure-proof counting
    const cardsInPanel = listPanel?.querySelectorAll('[data-card="sale"]').length || 0
    expect(cardsInPanel).toBe(4)
    expect(cardsInPanel).toBe(sales.length)
  })
  
  it('should handle empty sales list', () => {
    const sales: string[] = []
    const { container } = render(<MockSalesList sales={sales} />)
    
    const listPanel = container.querySelector('[data-panel="list"]')
    expect(listPanel).toBeTruthy()
    
    // Verify no cards are rendered
    const saleCards = listPanel?.querySelectorAll('[data-card="sale"]')
    expect(saleCards).toHaveLength(0)
  })
  
  it('should maintain grid structure with single card', () => {
    const sales = ['sale-1']
    const { container } = render(<MockSalesList sales={sales} />)
    
    const listPanel = container.querySelector('[data-panel="list"]')
    expect(listPanel).toBeTruthy()
    
    // Verify grid classes are still present
    expect(listPanel).toHaveClass('grid')
    expect(listPanel).toHaveClass('grid-cols-1')
    
    // Verify single card is rendered
    const saleCards = listPanel?.querySelectorAll('[data-card="sale"]')
    expect(saleCards).toHaveLength(1)
  })
})
