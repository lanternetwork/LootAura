export function getMapboxToken(): string {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  if (!mapboxToken) {
    throw new Error('Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN')
  }
  return mapboxToken
}


