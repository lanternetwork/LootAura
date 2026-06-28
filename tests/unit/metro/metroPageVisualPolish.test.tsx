import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MetroPageFaqAccordion from '@/components/metro/MetroPageFaqAccordion'

const items = [
  { question: 'How often are these listings updated?', answer: 'About every hour.' },
  { question: 'How far from Chicago are these sales?', answer: 'Within the metro radius.' },
]

describe('MetroPageFaqAccordion', () => {
  it('opens the first item by default and toggles sections', () => {
    render(<MetroPageFaqAccordion items={items} />)

    expect(screen.getByText('About every hour.')).toBeVisible()
    expect(screen.getByText('Within the metro radius.')).not.toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /How far from Chicago/i }))
    expect(screen.getByText('Within the metro radius.')).toBeVisible()
    expect(screen.getByText('About every hour.')).not.toBeVisible()
  })
})

describe('MetroPageStatsStrip', () => {
  it('renders snapshot-backed stats without new data sources', async () => {
    const { default: MetroPageStatsStrip } = await import('@/components/metro/MetroPageStatsStrip')
    render(
      <MetroPageStatsStrip
        activeListingCount={43}
        radiusMiles={25}
        lastUpdatedAt={new Date().toISOString()}
        nearbyMetros={[
          {
            slug: 'dallas-tx',
            city: 'Dallas',
            state: 'TX',
            timezone: 'America/Chicago',
            minActiveListings: 1,
          },
        ]}
      />
    )

    expect(screen.getByText('43')).toBeInTheDocument()
    expect(screen.getByText('25 mi')).toBeInTheDocument()
    expect(screen.getByText(/Dallas, TX/)).toBeInTheDocument()
  })
})
