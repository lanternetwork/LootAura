"use client"

import React, { useMemo } from 'react'

export default function TimePicker30({
  value,
  onChange,
  required,
  className
}: {
  value?: string
  onChange: (time: string) => void
  required?: boolean
  className?: string
}) {
  // Parse current value (expects HH:MM 24h)
  const { hour12, minute, ampm } = useMemo(() => {
    if (!value || !value.includes(':')) return { hour12: 9, minute: '00', ampm: 'AM' as 'AM' | 'PM' }
    const [hStr, mStr] = value.split(':')
    const h = Math.max(0, Math.min(23, parseInt(hStr, 10) || 0))
    const m = (parseInt(mStr, 10) || 0) >= 30 ? '30' : '00'
    const am = h < 12
    const hr12 = h % 12 === 0 ? 12 : h % 12
    return { hour12: hr12, minute: m as '00' | '30', ampm: (am ? 'AM' : 'PM') as 'AM' | 'PM' }
  }, [value])

  const hours = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])
  const minutes: Array<'00' | '30'> = ['00', '30']
  const ampmOptions: Array<'AM' | 'PM'> = ['AM', 'PM']

  const update = (h12: number, m: '00' | '30', ap: 'AM' | 'PM') => {
    const h24 = ap === 'AM' ? (h12 % 12) : ((h12 % 12) + 12)
    const next = `${String(h24).padStart(2, '0')}:${m}`
    onChange(next)
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-2">
        <select
          aria-label="Hour"
          value={hour12}
          required={required}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
          onChange={(e) => update(parseInt(e.target.value, 10), minute as '00' | '30', ampm)}
        >
          {hours.map(h => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>

        <select
          aria-label="Minute"
          value={minute}
          required={required}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
          onChange={(e) => update(hour12, e.target.value as '00' | '30', ampm)}
        >
          {minutes.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          aria-label="AM/PM"
          value={ampm}
          required={required}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-[var(--accent-primary)]"
          onChange={(e) => update(hour12, minute as '00' | '30', e.target.value as 'AM' | 'PM')}
        >
          {ampmOptions.map(ap => (
            <option key={ap} value={ap}>{ap}</option>
          ))}
        </select>
      </div>
    </div>
  )
}


