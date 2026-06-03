/** Minimal PNG IHDR bytes for raster probe tests (valid dimensions, not a banner). */
export function buildMinimalValidPngBytes(width = 100, height = 100): Uint8Array {
  const pngHeader = new Uint8Array(24)
  pngHeader.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  pngHeader[16] = (width >>> 24) & 0xff
  pngHeader[17] = (width >>> 16) & 0xff
  pngHeader[18] = (width >>> 8) & 0xff
  pngHeader[19] = width & 0xff
  pngHeader[20] = (height >>> 24) & 0xff
  pngHeader[21] = (height >>> 16) & 0xff
  pngHeader[22] = (height >>> 8) & 0xff
  pngHeader[23] = height & 0xff
  return pngHeader
}

export function minimalValidProbeFetchResponse(width = 100, height = 100): Response {
  const bytes = buildMinimalValidPngBytes(width, height)
  return new Response(new Blob([bytes]), { status: 206 })
}
