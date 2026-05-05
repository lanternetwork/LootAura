/**
 * Maps config `state` (USPS code or full name) to the URL path segment used under `/US/{segment}/...`
 * on list pages that follow a common US metro URL layout.
 */
const USPS_TO_SEGMENT: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  DC: 'District-of-Columbia',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New-Hampshire',
  NJ: 'New-Jersey',
  NM: 'New-Mexico',
  NY: 'New-York',
  NC: 'North-Carolina',
  ND: 'North-Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode-Island',
  SC: 'South-Carolina',
  SD: 'South-Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West-Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
}

/**
 * Returns the `/US/{segment}/` state segment for filtering listing links, or null if unknown.
 */
export function resolveUsListStatePathSegment(state: string): string | null {
  const t = state.trim()
  if (!t) return null
  if (t.length === 2) {
    return USPS_TO_SEGMENT[t.toUpperCase()] ?? null
  }
  return t.replace(/\s+/g, '-').replace(/[^a-zA-Z-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || null
}
