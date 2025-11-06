/**
 * Overpass API query builder and parser for address prefix searches
 */

export interface NormalizedAddress {
  id: string
  lat: number
  lng: number
  houseNumber: string
  street: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  countryCode?: string
  type: 'node' | 'way' | 'relation'
  upstreamIndex: number
}

/**
 * Build Overpass QL query for address prefix search (numeric-only)
 * @param prefix - 1-6 digits (already validated)
 * @param lat - User latitude
 * @param lng - User longitude
 * @param radiusM - Search radius in meters
 * @param timeoutSec - Query timeout in seconds
 */
export function buildOverpassAddressQuery(
  prefix: string,
  lat: number,
  lng: number,
  radiusM: number,
  timeoutSec: number
): string {
  // Validate prefix is numeric (1-6 digits)
  if (!/^\d{1,6}$/.test(prefix)) {
    throw new Error(`Invalid prefix: must be 1-6 digits, got "${prefix}"`)
  }

  const timeout = Math.floor(timeoutSec)
  const radius = Math.floor(radiusM)

  // Overpass QL query for nodes, ways, and relations with addr:housenumber prefix match
  const query = `[out:json][timeout:${timeout}];
(
  node["addr:housenumber"~"^${prefix}"]["addr:street"](around:${radius},${lat},${lng});
  way["addr:housenumber"~"^${prefix}"]["addr:street"](around:${radius},${lat},${lng});
  relation["addr:housenumber"~"^${prefix}"]["addr:street"](around:${radius},${lat},${lng});
);
out center 100;`

  return query
}

/**
 * Build Overpass QL query for digits+street search
 * @param num - 1-8 digits (already validated)
 * @param streetRegex - Normalized street regex pattern (case-insensitive)
 * @param lat - User latitude
 * @param lng - User longitude
 * @param radiusM - Search radius in meters
 * @param timeoutSec - Query timeout in seconds
 */
export function buildOverpassDigitsStreetQuery(
  num: string,
  streetRegex: string,
  lat: number,
  lng: number,
  radiusM: number,
  timeoutSec: number
): string {
  // Validate num is 1-8 digits
  if (!/^\d{1,8}$/.test(num)) {
    throw new Error(`Invalid num: must be 1-8 digits, got "${num}"`)
  }

  const timeout = Math.floor(timeoutSec)
  const radius = Math.floor(radiusM)

  // streetRegex is already a safe pattern from buildStreetRegex (tokens escaped, joined with \\s+)
  // Overpass QL supports (?i) for case-insensitive matching
  // Overpass QL query for nodes, ways, and relations with both housenumber prefix and street match
  const query = `[out:json][timeout:${timeout}];
(
  node["addr:housenumber"~"^${num}"]["addr:street"~"(?i)${streetRegex}"](around:${radius},${lat},${lng});
  way["addr:housenumber"~"^${num}"]["addr:street"~"(?i)${streetRegex}"](around:${radius},${lat},${lng});
  relation["addr:housenumber"~"^${num}"]["addr:street"~"(?i)${streetRegex}"](around:${radius},${lat},${lng});
);
out center 100;`

  return query
}

/**
 * Parse Overpass JSON response and normalize to AddressSuggestion format
 * @param json - Overpass API response JSON
 * @returns Array of normalized addresses with distance info
 */
export function parseOverpassElements(json: any): NormalizedAddress[] {
  if (!json || !json.elements || !Array.isArray(json.elements)) {
    return []
  }

  const normalized: NormalizedAddress[] = []

  json.elements.forEach((element: any, index: number) => {
    // Require both addr:housenumber and addr:street
    const houseNumber = element.tags?.['addr:housenumber']
    const street = element.tags?.['addr:street']

    if (!houseNumber || !street) {
      return // Drop items missing required fields
    }

    // Get coordinates based on element type
    let lat: number
    let lng: number

    if (element.type === 'node') {
      lat = element.lat
      lng = element.lon
    } else if (element.type === 'way' || element.type === 'relation') {
      // Use center coordinates for ways/relations
      if (element.center) {
        lat = element.center.lat
        lng = element.center.lon
      } else if (element.lat && element.lon) {
        lat = element.lat
        lng = element.lon
      } else {
        return // Skip if no coordinates
      }
    } else {
      return // Unknown element type
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return // Skip invalid coordinates
    }

    normalized.push({
      id: `${element.type}:${element.id}`,
      lat,
      lng,
      houseNumber: String(houseNumber),
      street: String(street),
      city: element.tags?.['addr:city'] || element.tags?.['addr:town'] || element.tags?.['addr:village'],
      state: element.tags?.['addr:state'],
      postcode: element.tags?.['addr:postcode'],
      country: element.tags?.['addr:country'],
      countryCode: element.tags?.['addr:country_code'],
      type: element.type,
      upstreamIndex: index
    })
  })

  return normalized
}

/**
 * Format address label for display
 * @param addr - Normalized address
 * @returns Formatted label string
 */
export function formatLabel(addr: NormalizedAddress): string {
  const parts: string[] = []
  
  // House number and street
  if (addr.houseNumber && addr.street) {
    parts.push(`${addr.houseNumber} ${addr.street}`)
  } else if (addr.street) {
    parts.push(addr.street)
  }

  // City, state, postcode
  const locationParts: string[] = []
  if (addr.city) locationParts.push(addr.city)
  if (addr.state) locationParts.push(addr.state)
  if (addr.postcode) locationParts.push(addr.postcode)

  if (locationParts.length > 0) {
    parts.push(locationParts.join(', '))
  }

  return parts.length > 0 ? parts.join(', ') : `${addr.houseNumber} ${addr.street}`
}

