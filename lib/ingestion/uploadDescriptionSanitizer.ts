export function sanitizeUploadDescription(value: string | null): string | null {
  if (value == null) return null
  // Split on line breaks first so noise tokens on separate lines are not merged into
  // one blob (collapsing whitespace first would defeat per-line filtering).
  let text = String(value)
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/street view|directions|view on map|report listing|share listing/i.test(line) &&
        !/source:\s*/i.test(line) &&
        !/https?:\/\/|www\.|[a-z0-9.-]+\.[a-z]{2,}/i.test(line) &&
        !/^\s*\d{3,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/i.test(line) &&
        !/^\s*(\d{1,2}:\d{2}\s*(am|pm)?\s*[-–—]\s*\d{1,2}:\d{2}\s*(am|pm)?)\s*$/i.test(line) &&
        !/^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:[-–—]\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)?\s*$/i.test(line)
    )
  text = lines.join(' ')

  // Inline pollution removal for mixed-content descriptions.
  // URLs and obvious source domains.
  text = text.replace(
    /\b(https?:\/\/\S+|www\.\S+|[a-z0-9.-]+\.(com|net|org|info|io|co)\b\S*)/gi,
    ''
  )
  // Inline "Source: ..." fragments (any trailing non-terminal token run).
  text = text.replace(/\bSource:\s*[^\s,.]+(?:\s+[^\s,.]+)*/gi, '')
  // Navigation/action labels that may appear inline.
  text = text.replace(/\bStreet View\b/gi, '')
  text = text.replace(/\bDirections\b/gi, '')
  text = text.replace(/\bView on map\b/gi, '')
  text = text.replace(/\bReport listing\b/gi, '')
  text = text.replace(/\bShare listing\b/gi, '')
  // Address-like tails (keep preceding prose).
  text = text.replace(
    /(?:,?\s*)\d{3,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?(?=\s|$)/gi,
    ''
  )
  // Date ranges like "5/9 - 5/9" or "5/9 - 5/10".
  text = text.replace(
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–—]\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi,
    ''
  )
  // Time ranges like "8:30 am - 5:00 pm".
  text = text.replace(
    /\b\d{1,2}(?::\d{2})?\s*(am|pm)\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi,
    ''
  )

  const out = text.replace(/\s+/g, ' ').trim()
  return out.length > 0 ? out : null
}
