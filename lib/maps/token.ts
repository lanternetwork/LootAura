export function getMapboxToken(): string {
  const t = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_MAP_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  return t || ''
}

export function hasMapboxToken(): boolean {
  return !!getMapboxToken()
}


