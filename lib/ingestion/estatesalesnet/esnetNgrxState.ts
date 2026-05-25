import { JSDOM } from 'jsdom'

/** Read ISO instant from ES.net NGRX DateTime wrapper or plain string. */
export function readEsnetNgrxDateTimeValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'object') {
    const wrapped = value as { _value?: unknown; _type?: unknown }
    if (typeof wrapped._value === 'string' && wrapped._value.trim()) {
      return wrapped._value.trim()
    }
  }
  return null
}

/** UTC calendar day YYYY-MM-DD from an NGRX date field. */
export function isoDayFromEsnetNgrxDateTime(value: unknown): string | null {
  const iso = readEsnetNgrxDateTimeValue(value)
  if (!iso) return null
  const day = iso.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

export function extractEsnetNgrxStateFromDocument(document: Document): Record<string, unknown> | null {
  const el =
    document.querySelector('#estatesales-net-state') ??
    document.querySelector('script#estatesales-net-state[type="application/json"]')
  if (!el?.textContent?.trim()) {
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      const text = script.textContent?.trim()
      if (text?.includes('NGRX_STATE')) {
        try {
          return JSON.parse(text) as Record<string, unknown>
        } catch {
          continue
        }
      }
    }
    return null
  }
  try {
    return JSON.parse(el.textContent.trim()) as Record<string, unknown>
  } catch {
    return null
  }
}

export function extractEsnetNgrxStateFromHtml(html: string, pageUrl: string): Record<string, unknown> | null {
  const normalizedHtml = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const dom = new JSDOM(normalizedHtml, { url: pageUrl })
  return extractEsnetNgrxStateFromDocument(dom.window.document)
}
