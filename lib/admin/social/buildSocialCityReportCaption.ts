export function buildSocialCityReportCaption(options: {
  city: string
  state: string
  cityRank: number
  activeSales: number
}): string {
  const { city, state, cityRank, activeSales } = options
  const location = `${city}, ${state}`

  return [
    `${location} is currently the`,
    `#${cityRank} most active city this weekend`,
    `with ${activeSales.toLocaleString('en-US')} active sales.`,
    '',
    'Inventory is updated continuously',
    'as new sales are published.',
  ].join('\n')
}
