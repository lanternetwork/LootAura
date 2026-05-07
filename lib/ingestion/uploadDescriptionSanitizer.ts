function cleanText(value: string | null): string | null {
  if (value == null) return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

export function sanitizeUploadDescription(value: string | null): string | null {
  const normalized = cleanText(value)
  if (!normalized) return null
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((line) => !/street view|directions|source:|view on map|report listing|share listing/i.test(line))
    .filter((line) => !/(https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,})/i.test(line))
    .filter((line) => !/^\s*\d{3,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/i.test(line))
    .filter((line) => !/^\s*(\d{1,2}:\d{2}\s*(am|pm)?\s*[-–—]\s*\d{1,2}:\d{2}\s*(am|pm)?)\s*$/i.test(line))
    .filter((line) => !/^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:[-–—]\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)?\s*$/i.test(line))
  const out = lines.join(' ').replace(/\s+/g, ' ').trim()
  return out.length > 0 ? out : null
}
