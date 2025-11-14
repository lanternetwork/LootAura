// Client-safe distance formatting utilities
// These functions are pure and don't depend on server-only code

export function metersToMiles(meters: number): number {
  return meters * 0.000621371
}

export function metersToKilometers(meters: number): number {
  return meters / 1000
}

export function formatDistance(meters: number, unit: 'miles' | 'km' = 'miles'): string {
  if (unit === 'miles') {
    const miles = metersToMiles(meters)
    return miles < 1 ? `${Math.round(miles * 10) / 10} mi` : `${Math.round(miles)} mi`
  } else {
    const km = metersToKilometers(meters)
    return km < 1 ? `${Math.round(km * 10) / 10} km` : `${Math.round(km)} km`
  }
}

