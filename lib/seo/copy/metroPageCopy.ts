import type { SeoPilotMetro } from '@/lib/seo/types'

export function buildMetroHeroHeadline(metro: SeoPilotMetro): string {
  return `Yard Sales in ${metro.city}, ${metro.state}`
}

export function buildMetroHeroSubtitle(options: {
  activeListingCount: number
  radiusMiles: number
  city: string
  weekend?: boolean
}): string {
  const { activeListingCount, radiusMiles, city, weekend } = options
  const saleWord = activeListingCount === 1 ? 'active yard sale' : 'active yard sales'
  const scope = weekend ? `${saleWord} this weekend` : saleWord
  return `${activeListingCount} ${scope} within ${radiusMiles} miles of downtown ${city}`
}

export function buildMetroHelpfulContentParagraphs(options: {
  metro: SeoPilotMetro
  radiusMiles: number
  interactiveMapHref: string
}): string[] {
  const { metro, radiusMiles, interactiveMapHref } = options
  return [
    `LootAura lists yard sales, garage sales, and estate sales across the ${metro.city}, ${metro.state} metro area. Listings on this page are refreshed from our hourly inventory snapshot so you can browse photos, dates, and locations without loading the full interactive map.`,
    `Sales shown here are within ${radiusMiles} miles of downtown ${metro.city}. That radius captures nearby suburbs and surrounding communities while keeping results relevant to local shoppers.`,
    `Inventory updates hourly as sellers publish new listings. For live search, filters, and map panning, open the interactive marketplace.`,
    `Continue to the interactive map: ${interactiveMapHref}`,
  ]
}

export type MetroFaqItem = {
  question: string
  answer: string
}

export function buildMetroFaqItems(options: {
  metro: SeoPilotMetro
  radiusMiles: number
}): MetroFaqItem[] {
  const { metro, radiusMiles } = options
  return [
    {
      question: 'How often are these listings updated?',
      answer:
        'Metro inventory is rebuilt from our snapshot pipeline about every hour. Freshness labels on this page reflect the latest snapshot time.',
    },
    {
      question: `How far from ${metro.city} are these sales?`,
      answer: `Listings include sales within ${radiusMiles} miles of downtown ${metro.city}, ${metro.state}. Distance is measured from the metro center defined in our geography catalog.`,
    },
    {
      question: 'Are estate sales included?',
      answer:
        'Yes. This page includes yard sales, garage sales, and estate sales that are active in the metro inventory snapshot. Estate sales are labeled when detected from the listing title.',
    },
    {
      question: 'How do I list my own sale?',
      answer:
        'Create a free listing on LootAura to reach buyers in your area. Use the Post Your Yard Sale button at the top of this page or visit /sell/new to get started.',
    },
  ]
}

export function buildWeekendMetroHeroHeadline(metro: SeoPilotMetro): string {
  return `Yard Sales This Weekend in ${metro.city}, ${metro.state}`
}

export function buildWeekendMetroHelpfulContentParagraphs(options: {
  metro: SeoPilotMetro
  radiusMiles: number
  weekendLabel: string
  cityPageHref: string
}): string[] {
  const { metro, radiusMiles, weekendLabel, cityPageHref } = options
  return [
    `Planning for ${weekendLabel}? This page lists yard sales happening this weekend in the ${metro.city}, ${metro.state} metro (${metro.timezone}).`,
    `Weekend dates use the metro timezone, not your browser clock. Listings are limited to sales within ${radiusMiles} miles of downtown ${metro.city}.`,
    `Inventory refreshes hourly from our snapshot pipeline. For all active area listings (not just this weekend), see the city page: ${cityPageHref}`,
  ]
}
