import { coerceIngestedDateToYyyyMmDd } from '@/lib/ingestion/saleWindowDates'
import {
  extractStandaloneSaleStartTimeFromText,
  isStandaloneSaleHourRangeLine,
} from '@/lib/ingestion/saleHourRangeFromText'

const SLASH_DATE_RANGE_LINE = /^\d{1,2}\/\d{1,2}\s*[-–—]\s*\d{1,2}\/\d{1,2}$/
const SLASH_SINGLE_DATE_LINE = /^\d{1,2}\/\d{1,2}$/

const STANDALONE_TIME_CAPTURE =
  '(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|\\d{1,2}(?::\\d{2})?(?:am|pm))'

const STANDALONE_START_LINE_PATTERNS: readonly RegExp[] = [
  new RegExp(`^\\s*start\\s*time\\s*:\\s*${STANDALONE_TIME_CAPTURE}\\s*$`, 'i'),
  new RegExp(`^\\s*start\\s*time\\s+${STANDALONE_TIME_CAPTURE}\\s*$`, 'i'),
  new RegExp(`^\\s*starts?\\s+at\\s+${STANDALONE_TIME_CAPTURE}\\s*$`, 'i'),
  new RegExp(`^\\s*begins?\\s+at\\s+${STANDALONE_TIME_CAPTURE}\\s*$`, 'i'),
  new RegExp(`^\\s*sale\\s+starts\\s+${STANDALONE_TIME_CAPTURE}\\s*$`, 'i'),
]

export type YstmDetailScheduleExtraction = {
  readonly scheduleLines: readonly string[]
  readonly scheduleText: string | null
  readonly descriptionText: string | null
  readonly hasScheduleBlock: boolean
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function normalizeLine(line: string): string {
  return String(line || '').replace(/\s+/g, ' ').trim()
}

/** True when a single line is YSTM authoritative schedule metadata (not promo prose). */
export function isYstmScheduleLine(line: string): boolean {
  const normalized = normalizeLine(line)
  if (!normalized) return false
  if (isStandaloneSaleHourRangeLine(normalized)) return true
  if (SLASH_DATE_RANGE_LINE.test(normalized)) return true
  if (SLASH_SINGLE_DATE_LINE.test(normalized)) return true
  if (isStandaloneStartScheduleLine(normalized)) return true
  return false
}

function isStandaloneStartScheduleLine(line: string): boolean {
  if (!extractStandaloneSaleStartTimeFromText(line)) return false
  return STANDALONE_START_LINE_PATTERNS.some((pattern) => pattern.test(line))
}

/** Split inner content lines; bottom cluster of schedule lines wins over promo above. */
export function splitYstmContentLinesIntoScheduleAndDescription(lines: readonly string[]): {
  readonly scheduleLines: string[]
  readonly descriptionLines: string[]
} {
  const scheduleLines: string[] = []
  let stopIndex = lines.length - 1

  while (stopIndex >= 0) {
    const line = normalizeLine(lines[stopIndex] ?? '')
    if (!line) {
      stopIndex--
      continue
    }
    if (!isYstmScheduleLine(line)) break
    scheduleLines.unshift(line)
    stopIndex--
  }

  const descriptionLines = lines
    .slice(0, stopIndex + 1)
    .map((line) => normalizeLine(line))
    .filter(Boolean)

  return { scheduleLines, descriptionLines }
}

function insertNewlinesForBlockBreaks(root: HTMLElement): void {
  const doc = root.ownerDocument
  for (const br of [...root.querySelectorAll('br')]) {
    br.replaceWith(doc.createTextNode('\n'))
  }
  for (const p of [...root.querySelectorAll('p')]) {
    p.append(doc.createTextNode('\n'))
  }
}

export function extractLinesFromYstmContentElement(container: HTMLElement): string[] {
  insertNewlinesForBlockBreaks(container)
  return (container.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
}

/** Parse slash dates from schedule lines only (no month-name prose). */
export function parseYstmScheduleBlockSlashDates(
  scheduleText: string
): { readonly start?: string; readonly end?: string } {
  const year = new Date().getUTCFullYear()

  function toIso(m: number, d: number): string | null {
    if (!Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) {
      return null
    }
    return `${year}-${pad2(m)}-${pad2(d)}`
  }

  const lines = scheduleText
    .split('\n')
    .map((line) => normalizeLine(line))
    .filter(Boolean)

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    const range = line.match(/^(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})$/)
    if (range) {
      const start = toIso(Number.parseInt(range[1]!, 10), Number.parseInt(range[2]!, 10))
      const end = toIso(Number.parseInt(range[3]!, 10), Number.parseInt(range[4]!, 10))
      if (start && end) return { start, end }
    }
    const single = line.match(/^(\d{1,2})\/(\d{1,2})$/)
    if (single) {
      const iso = toIso(Number.parseInt(single[1]!, 10), Number.parseInt(single[2]!, 10))
      if (iso) return { start: iso, end: iso }
    }
  }

  return {}
}

type JsonLdNode = Record<string, unknown>

export function extractYstmDetailDatesFromJsonLd(html: string): {
  readonly start?: string
  readonly end?: string
} {
  const scriptPattern =
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = scriptPattern.exec(html)) !== null) {
    const raw = match[1]?.trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as JsonLdNode | JsonLdNode[]
      const nodes = Array.isArray(parsed) ? parsed : [parsed]
      for (const node of nodes) {
        const typeRaw = node['@type']
        const typeList =
          typeof typeRaw === 'string'
            ? [typeRaw]
            : Array.isArray(typeRaw)
              ? typeRaw.map(String)
              : []
        const isEvent =
          typeList.length === 0 || typeList.some((t) => t.toLowerCase() === 'event')
        if (!isEvent) continue
        const start = coerceIngestedDateToYyyyMmDd(node.startDate)
        const end = coerceIngestedDateToYyyyMmDd(node.endDate)
        if (start || end) {
          return {
            start: start ?? undefined,
            end: end ?? start ?? undefined,
          }
        }
      }
    } catch {
      continue
    }
  }
  return {}
}

function resolveYstmDetailContentBlock(document: Document): HTMLElement | null {
  const addressEl = document.getElementById('address')
  return (
    (addressEl?.closest('.content') as HTMLElement | null) ??
    (document.querySelector('.listing .content[style*="margin-top"]') as HTMLElement | null) ??
    (document.querySelector('.listing .content') as HTMLElement | null)
  )
}

export function extractYstmDetailScheduleFromDocument(document: Document): YstmDetailScheduleExtraction {
  const contentBlock = resolveYstmDetailContentBlock(document)
  if (!contentBlock) {
    return {
      scheduleLines: [],
      scheduleText: null,
      descriptionText: null,
      hasScheduleBlock: false,
    }
  }

  const clone = contentBlock.cloneNode(true) as HTMLElement
  for (const el of clone.querySelectorAll('#address, #attribution, a')) {
    el.remove()
  }

  const lines = extractLinesFromYstmContentElement(clone)
  const { scheduleLines, descriptionLines } = splitYstmContentLinesIntoScheduleAndDescription(lines)

  const descriptionText =
    descriptionLines.length > 0 ? descriptionLines.join(' ').replace(/\s+/g, ' ').trim() : null

  return {
    scheduleLines,
    scheduleText: scheduleLines.length > 0 ? scheduleLines.join('\n') : null,
    descriptionText,
    hasScheduleBlock: scheduleLines.length > 0,
  }
}
