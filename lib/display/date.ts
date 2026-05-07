function parseDateOnlyParts(dateString: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateString || '').trim())
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

export function parseDateOnlyLocal(dateString: string): Date | null {
  const parsed = parseDateOnlyParts(dateString)
  if (!parsed) return null
  return new Date(parsed.year, parsed.month - 1, parsed.day)
}

export function formatDateOnly(
  dateString: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }
): string {
  const localDate = parseDateOnlyLocal(dateString)
  if (!localDate) return dateString
  return localDate.toLocaleDateString('en-US', options)
}

