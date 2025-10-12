export function haversineKm(a: {lat: number, lng: number}, b: {lat: number, lng: number}) {
  const toRad = (n: number) => (n * Math.PI) / 180
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sa = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng/2)**2
  return 2 * R * Math.asin(Math.sqrt(sa))
}

export function kmToMiles(km: number): number {
  return km * 0.621371
}

/**
 * @deprecated Use utils/geo.ts instead
 */
export function milesToKm(miles: number): number {
  return miles * 1.60934
}
