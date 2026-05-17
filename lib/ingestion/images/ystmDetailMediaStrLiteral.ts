function decodeJsQuotedLiteral(raw: string, quote: "'" | '"'): string {
  if (quote === "'") {
    return raw
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\//g, '/')
  }
  return raw
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\//g, '/')
}

const MEDIA_STR_SINGLE_RE =
  /(?:const|let|var)\s+mediaStr\s*=\s*'((?:\\.|[^'\\])*)'\s*;/i
const MEDIA_STR_DOUBLE_RE =
  /(?:const|let|var)\s+mediaStr\s*=\s*"((?:\\.|[^"\\])*)"\s*;/i

/**
 * Read YSTM inline `mediaStr` assignment from static HTML (single- or double-quoted).
 */
export function extractYstmMediaStrJsonLiteral(html: string): string | null {
  const single = html.match(MEDIA_STR_SINGLE_RE)
  if (single?.[1]) return decodeJsQuotedLiteral(single[1], "'")

  const double = html.match(MEDIA_STR_DOUBLE_RE)
  if (double?.[1]) return decodeJsQuotedLiteral(double[1], '"')

  return null
}
