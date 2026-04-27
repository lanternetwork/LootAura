import { RawExternalSale, CityIngestionConfig, ProcessedIngestedSale, FailureReason } from '@/lib/ingestion/types'

const VAGUE_TIME_KEYWORDS = ['morning', 'afternoon', 'all day', 'allday', 'all-day']
const GENERIC_TITLES = new Set(['sale', 'garage sale', 'yard sale', 'estate sale'])

function cleanText(value: string | null): string | null {
  if (value == null) return null
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

function hasStreetNumberAndName(address: string | null): boolean {
  if (!address) return false
  return /^\s*\d+\s+.+/.test(address)
}

function parseDateFromText(text: string): Date | null {
  const trimmed = text.trim()
  const iso = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) {
    return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00Z`)
  }
  const us = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/)
  if (us) {
    const mm = us[1].padStart(2, '0')
    const dd = us[2].padStart(2, '0')
    return new Date(`${us[3]}-${mm}-${dd}T12:00:00Z`)
  }
  const fallback = new Date(trimmed)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

function toDateInTimezone(raw: string | number | null, timezone: string): string | null {
  if (raw == null) return null
  const date = typeof raw === 'number' ? new Date(raw) : parseDateFromText(raw)
  if (Number.isNaN(date.getTime())) return null
  // en-CA yields YYYY-MM-DD shape in all runtime targets.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function parseTimeRange(description: string | null): { start: string; end: string; source: 'explicit' | 'default'; conflicting: boolean } {
  const value = (description || '').toLowerCase()
  const explicitMatch = value.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  if (explicitMatch) {
    const startHour = Number.parseInt(explicitMatch[1], 10)
    const startMin = Number.parseInt(explicitMatch[2] || '0', 10)
    const endHour = Number.parseInt(explicitMatch[4], 10)
    const endMin = Number.parseInt(explicitMatch[5] || '0', 10)
    const startAmpm = explicitMatch[3]
    const endAmpm = explicitMatch[6]

    const normalizeHour = (hour: number, ampm: string | undefined): number => {
      if (!ampm) return hour
      const lower = ampm.toLowerCase()
      if (lower === 'am') return hour === 12 ? 0 : hour
      return hour === 12 ? 12 : hour + 12
    }

    const sh = normalizeHour(startHour, startAmpm)
    const eh = normalizeHour(endHour, endAmpm)
    if (Number.isFinite(sh) && Number.isFinite(eh)) {
      return {
        start: `${String(sh).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`,
        end: `${String(eh).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`,
        source: 'explicit',
        conflicting: false,
      }
    }
  }

  const hasVague = VAGUE_TIME_KEYWORDS.some((k) => value.includes(k))
  const hasConflicting = /(am|pm).*(morning|all day)|(morning|all day).*(am|pm)/.test(value)
  if (hasConflicting) {
    return {
      start: '09:00:00',
      end: '14:00:00',
      source: 'default',
      conflicting: true,
    }
  }
  if (hasVague || !value) {
    return {
      start: '09:00:00',
      end: '14:00:00',
      source: 'default',
      conflicting: false,
    }
  }

  return {
    start: '09:00:00',
    end: '14:00:00',
    source: 'default',
    conflicting: false,
  }
}

function snapToThirtyMinutes(time: string): string {
  const [h, m] = time.split(':')
  const hour = Number.parseInt(h || '0', 10)
  const min = Number.parseInt(m || '0', 10)
  if (!Number.isFinite(hour) || !Number.isFinite(min)) return time
  const snapped = Math.round(min / 30) * 30
  const carry = snapped === 60 ? 1 : 0
  const nextHour = (hour + carry) % 24
  const finalMin = snapped === 60 ? 0 : snapped
  return `${String(nextHour).padStart(2, '0')}:${String(finalMin).padStart(2, '0')}:00`
}

function weakTitle(title: string | null): boolean {
  if (!title) return true
  const normalized = title.trim().toLowerCase()
  return normalized.length < 5 || GENERIC_TITLES.has(normalized)
}

export async function processIngestedSale(rawSale: RawExternalSale, cityConfig: CityIngestionConfig): Promise<ProcessedIngestedSale> {
  const failureReasons: FailureReason[] = []
  const addressRaw = cleanText(rawSale.addressRaw)
  const description = cleanText(rawSale.description)
  const city = cleanText(rawSale.cityHint) || cleanText(cityConfig.city)
  const state = cleanText(rawSale.stateHint) || cleanText(cityConfig.state)

  const normalizedAddress = addressRaw?.toLowerCase().replace(/\s+/g, ' ') || null
  if (!hasStreetNumberAndName(addressRaw)) {
    failureReasons.push(addressRaw ? 'invalid_address_format' : 'missing_address')
  }

  const dateStart = toDateInTimezone(rawSale.dateRaw, cityConfig.timezone)
  if (!dateStart) {
    failureReasons.push(rawSale.dateRaw == null ? 'missing_date' : 'invalid_date')
  }

  const time = parseTimeRange(description)
  if (time.conflicting) {
    failureReasons.push('conflicting_time')
  }

  const timeStart = snapToThirtyMinutes(time.start)
  const timeEnd = snapToThirtyMinutes(time.end)

  const title = weakTitle(cleanText(rawSale.title))
    ? `${cityConfig.city} Yard Sale`
    : (cleanText(rawSale.title) as string)

  const hasAddressError = failureReasons.includes('missing_address') || failureReasons.includes('invalid_address_format')
  const hasDateError = failureReasons.includes('missing_date') || failureReasons.includes('invalid_date')
  const status: ProcessedIngestedSale['status'] =
    !hasAddressError && !hasDateError ? 'needs_geocode' : 'needs_check'
  const parseConfidence: ProcessedIngestedSale['parseConfidence'] = status === 'needs_geocode' ? 'high' : 'low'

  return {
    normalizedAddress,
    city,
    state,
    lat: null,
    lng: null,
    dateStart,
    dateEnd: null,
    timeStart,
    timeEnd,
    timeSource: time.source,
    dateSource: rawSale.dateRaw == null ? null : 'source_date_raw',
    status,
    failureReasons,
    parseConfidence,
  }
}

