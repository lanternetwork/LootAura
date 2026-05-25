import { JSDOM } from 'jsdom'

/** Plain text from ES.net htmlDescription (safe fragment parse). */
export function htmlDescriptionToPlainText(html: string | null | undefined): string | null {
  if (!html?.trim()) return null
  const dom = new JSDOM(`<body>${html}</body>`)
  const text = dom.window.document.body.textContent?.replace(/\s+/g, ' ').trim()
  return text && text.length > 0 ? text : null
}
