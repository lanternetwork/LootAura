export function getMapboxToken(): string {
  const t = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''
  return t || ''
}


