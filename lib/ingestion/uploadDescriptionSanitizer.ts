export function sanitizeUploadDescription(value: string | null): string | null {
  if (value == null) return null

  const stripInlinePollution = (input: string): string => {
    let text = input
    // URLs and obvious source domains.
    text = text.replace(/\b(https?:\/\/\S+|www\.\S+|[a-z0-9.-]+\.(com|net|org|info|io|co)\b\S*)/gi, '')
    // Inline "Source: ..." fragments.
    text = text.replace(/\bSource:\s*[^\s,.]+(?:\s+[^\s,.]+)*/gi, '')
    // Standalone "Source:" label (no trailing token).
    text = text.replace(/\bSource:\b/gi, '')
    // Navigation/action labels.
    text = text.replace(/\bStreet View\b/gi, '')
    text = text.replace(/\bDirections\b/gi, '')
    text = text.replace(/\bView on map\b/gi, '')
    text = text.replace(/\bReport listing\b/gi, '')
    text = text.replace(/\bShare listing\b/gi, '')
    // Address tails.
    text = text.replace(
      /(?:,?\s*)\d{3,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?(?=\s|$)/gi,
      ''
    )
    // Date ranges.
    text = text.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–—]\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, '')
    // Time ranges.
    text = text.replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, '')

    text = text.replace(/\s+/g, ' ').trim()
    // Clean up leftover punctuation spacing.
    text = text.replace(/\s+([,.;:!?])/g, '$1')
    text = text.replace(/^[,.;:!?]+\s*/g, '')
    return text.trim()
  }

  // Sanitize per-line first, but do NOT drop mixed-content lines just because they contain noise tokens.
  const cleanedLines = String(value)
    .split(/\r?\n+/)
    .map((line) => stripInlinePollution(line.replace(/\s+/g, ' ').trim()))
    .filter(Boolean)
    // Drop lines that are still "pure noise" after stripping.
    .filter((line) => {
      if (/^\s*\d{3,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/i.test(line)) return false
      if (/^\s*(\d{1,2}:\d{2}\s*(am|pm)?\s*[-–—]\s*\d{1,2}:\d{2}\s*(am|pm)?)\s*$/i.test(line)) return false
      if (/^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:[-–—]\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)?\s*$/i.test(line)) return false
      if (/^(street view|directions|view on map|report listing|share listing)$/i.test(line)) return false
      if (/^source:\s*/i.test(line)) return false
      if (/^(https?:\/\/|www\.)/i.test(line)) return false
      return true
    })

  const out = stripInlinePollution(cleanedLines.join(' '))
  return out.length > 0 ? out : null
}
