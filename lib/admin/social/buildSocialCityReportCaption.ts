export function buildSocialCityReportCaption(options: {
  city: string
  state: string
  cityRank: number | null
  activeSales: number
}): string {
  const { city, state, cityRank, activeSales } = options
  const location = `${city}, ${state}`
  const salesLine = `${activeSales.toLocaleString('en-US')} active sales`

  if (cityRank == null) {
    return [
      `${location} has ${salesLine} this weekend`,
      'inside this report viewport.',
      '',
      'Inventory is updated continuously',
      'as new sales are published.',
    ].join('\n')
  }

  return [
    `${location} is currently the`,
    `#${cityRank} most active city this weekend`,
    `among ranked metros with ${salesLine}.`,
    '',
    'Inventory is updated continuously',
    'as new sales are published.',
  ].join('\n')
}
