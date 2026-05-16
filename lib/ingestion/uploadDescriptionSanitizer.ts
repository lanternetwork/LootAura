import { isStandaloneSaleHourRangeLine } from '@/lib/ingestion/saleHourRangeFromText'

export function sanitizeUploadDescription(value: string | null): string | null {
  if (value == null) return null

  const stripInlinePollution = (input: string): string => {
    let text = input
    // URLs and obvious source domains.
    text = text.replace(/\b(https?:\/\/\S+|www\.\S+|[a-z0-9.-]+\.(com|net|org|info|io|co)\b\S*)/gi, '')
    // Inline "Source: ..." fragments.
    text = text.replace(/\bSource:\s*[^\s,.]+(?:\s+[^\s,.]+)*/gi, '')
    // Standalone "Source:" (incl. end-of-string; \b after ':' is unreliable at EOS).
    text = text.replace(/\bSource:\s*/gi, '')
    // Navigation/action labels.
    text = text.replace(/\bStreet View\b/gi, '')
    text = text.replace(/\bDirections\b/gi, '')
    text = text.replace(/\bView on map\b/gi, '')
    text = text.replace(/\bReport listing\b/gi, '')
    text = text.replace(/\bShare listing\b/gi, '')
    text = text.replace(/\bFor more information\b/gi, '')
    text = text.replace(/\bplease visit us at\b/gi, '')
    text = text.replace(/\bclick here\b/gi, '')
    text = text.replace(/\bsee listing\b/gi, '')
    // Weekday-prefixed date ranges and single-day date labels.
    text = text.replace(
      /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\.?\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–—]\s*(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\.?\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi,
      ''
    )
    text = text.replace(
      /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\.?\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi,
      ''
    )
    // Labeled single-time fragments.
    text = text.replace(/\bstart(?:s)?\s*time\s*:\s*\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, '')
    text = text.replace(/\bstarts?\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)\b/gi, '')
    // Address tails.
    text = text.replace(
      /(?:,?\s*)\d{3,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?(?=\s|$)/gi,
      ''
    )
    // ZIP/country tails.
    text = text.replace(/(?:^|[\s,;])\d{5}(?:-\d{4})?\s*,?\s*USA\b/gi, ' ')
    text = text.replace(/(?:^|[\s,;])\d{5}(?:-\d{4})?\b(?=\s*$)/gi, ' ')
    // Date ranges (dates belong in dateRaw / structured fields, not description prose).
    text = text.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[-–—]\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, '')
    // Sale-hour ranges are preserved (not stripped).

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
      if (isStandaloneSaleHourRangeLine(line)) return true
      if (/^\s*\d{3,6}\s+[A-Za-z0-9.\-'\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?\s*$/i.test(line)) return false
      if (/^\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:[-–—]\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)?\s*$/i.test(line)) return false
      if (/^(street view|directions|view on map|report listing|share listing)$/i.test(line)) return false
      if (/^(for more information|please visit us at|click here|see listing)$/i.test(line)) return false
      if (/^start(?:s)?\s*time\s*:\s*\d{1,2}(?::\d{2})?\s*(am|pm)$/i.test(line)) return false
      if (/^starts?\s+at\s+\d{1,2}(?::\d{2})?\s*(am|pm)$/i.test(line)) return false
      if (/^\d{5}(?:-\d{4})?\s*,?\s*USA$/i.test(line)) return false
      if (/^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?\.?\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/i.test(line)) return false
      if (/^source:\s*/i.test(line)) return false
      if (/^(https?:\/\/|www\.)/i.test(line)) return false
      return true
    })

  const out = stripInlinePollution(cleanedLines.join(' '))
  return out.length > 0 ? out : null
}
