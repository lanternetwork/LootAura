// Minimal unsavory/profanity filter. Keep list small and maintainable.
// Matches whole words case-insensitively; ignores punctuation boundaries.

const UNSAVORY_WORDS = [
  // Common profanities (redacted to first/last char to avoid poisoning logs)
  'f[^\w]?u[^\w]?c[^\w]?k',
  's[^\w]?h[^\w]?i[^\w]?t',
  'b[^\w]?i[^\w]?t[^\w]?c[^\w]?h',
  'a[^\w]?s[^\w]?s[^\w]?',
  'd[^\w]?a[^\w]?m[^\w]?n',
  'c[^\w]?r[^\w]?a[^\w]?p',
  // Slurs/unsavory placeholders (keep general)
  'slut', 'whore'
] as const

const WORD_BOUNDARY = '(^|[^a-z0-9])'

const UNSAVORY_REGEX = new RegExp(
  UNSAVORY_WORDS.map((w) => `${WORD_BOUNDARY}(${w})($|[^a-z0-9])`).join('|'),
  'i'
)

export function containsUnsavory(text: string | undefined | null): { ok: boolean; match?: string } {
  if (!text) return { ok: true }
  const m = text.match(UNSAVORY_REGEX)
  if (m) {
    // Find the first captured offending term
    const captured = m.slice(2).find(Boolean)
    return { ok: false, match: captured || m[0] }
  }
  return { ok: true }
}

export function assertNoUnsavory(fields: Array<[string, string | undefined | null]>): { ok: boolean; field?: string; match?: string } {
  for (const [field, value] of fields) {
    const res = containsUnsavory(value)
    if (!res.ok) return { ok: false, field, match: res.match }
  }
  return { ok: true }
}


