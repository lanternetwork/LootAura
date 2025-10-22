export type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

export function getMapBBox(map: any): BBox | null {
  try {
    const b = map.getBounds();
    return { minLng: b.getWest(), minLat: b.getSouth(), maxLng: b.getEast(), maxLat: b.getNorth() };
  } catch {
    return null;
  }
}

export function bboxToQuery(b: BBox) {
  const p = new URLSearchParams();
  p.set("minLng", String(b.minLng));
  p.set("minLat", String(b.minLat));
  p.set("maxLng", String(b.maxLng));
  p.set("maxLat", String(b.maxLat));
  return p.toString();
}
