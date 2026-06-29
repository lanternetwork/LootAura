import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import {
  isYstmScheduleLine,
  parseYstmScheduleBlockSlashDates,
  splitYstmContentLinesIntoScheduleAndDescription,
} from '@/lib/ingestion/acquisition/ystmDetailScheduleBlock'

describe('ystmDetailScheduleBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('classifies authoritative schedule lines but not month-name promo', () => {
    expect(isYstmScheduleLine('11:00 am - 5:30 pm')).toBe(true)
    expect(isYstmScheduleLine('7/3 - 7/3')).toBe(true)
    expect(isYstmScheduleLine('Start time: 8am')).toBe(true)
    expect(isYstmScheduleLine('July 10-12')).toBe(false)
    expect(isYstmScheduleLine('We have moved all the Legos from our July 10-12 Crawfordsville sale')).toBe(
      false
    )
  })

  it('peels bottom schedule cluster and keeps promo above as description', () => {
    const lines = [
      'LEGOS!!! SPECIAL SALE ON JULY 3',
      'We have moved all the Legos from our July 10-12 Crawfordsville sale to this location.',
      '11:00 am - 5:30 pm',
      '7/3 - 7/3',
    ]
    const { scheduleLines, descriptionLines } = splitYstmContentLinesIntoScheduleAndDescription(lines)
    expect(scheduleLines).toEqual(['11:00 am - 5:30 pm', '7/3 - 7/3'])
    expect(descriptionLines).toEqual([
      'LEGOS!!! SPECIAL SALE ON JULY 3',
      'We have moved all the Legos from our July 10-12 Crawfordsville sale to this location.',
    ])
  })

  it('skips blank lines between schedule lines when peeling from bottom', () => {
    const lines = ['10:00 am - 4:00 pm', '', '5/21 - 5/24']
    const { scheduleLines, descriptionLines } = splitYstmContentLinesIntoScheduleAndDescription(lines)
    expect(scheduleLines).toEqual(['10:00 am - 4:00 pm', '5/21 - 5/24'])
    expect(descriptionLines).toEqual([])
  })

  it('parses slash dates from schedule text only', () => {
    expect(parseYstmScheduleBlockSlashDates('11:00 am - 5:30 pm\n7/3 - 7/3')).toEqual({
      start: '2026-07-03',
      end: '2026-07-03',
    })
    expect(parseYstmScheduleBlockSlashDates('July 10-12')).toEqual({})
  })
})
