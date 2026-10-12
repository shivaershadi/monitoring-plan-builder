import { describe, expect, it } from 'vitest'
import { parseTiming } from './timing'

const today = new Date(Date.UTC(2026, 9, 12)) // 2026-10-12

describe('parseTiming', () => {
  it('reads ISO dates and ranges', () => {
    expect(parseTiming('2026-10-30', today)).toMatchObject({ kind: 'date', start: '2026-10-30', end: '2026-10-30' })
    expect(parseTiming('2026-09-01 to 2026-09-20', today)).toMatchObject({ kind: 'period', start: '2026-09-01', end: '2026-09-20' })
  })
  it('reads day-first numeric dates', () => {
    expect(parseTiming('30/10/2026', today)).toMatchObject({ kind: 'date', start: '2026-10-30' })
    expect(parseTiming('31/02/2026', today).kind).toBe('unresolved')
  })
  it('reads day ranges within a month, inferring the year when missing', () => {
    expect(parseTiming('1–15 Sep 2026', today)).toMatchObject({ kind: 'period', start: '2026-09-01', end: '2026-09-15', confidence: 'high' })
    expect(parseTiming('1 to 20 sept', today)).toMatchObject({ kind: 'period', start: '2026-09-01', end: '2026-09-20', confidence: 'medium' })
  })
  it('reads single dates in words', () => {
    expect(parseTiming('15 March 2027', today)).toMatchObject({ kind: 'date', start: '2027-03-15' })
    expect(parseTiming('March 15, 2027', today)).toMatchObject({ kind: 'date', start: '2027-03-15' })
    expect(parseTiming('15th of March', today)).toMatchObject({ kind: 'date', start: '2027-03-15', confidence: 'medium' })
  })
  it('reads months, month ranges, quarters and halves', () => {
    expect(parseTiming('November 2026', today)).toMatchObject({ kind: 'period', start: '2026-11-01', end: '2026-11-30' })
    expect(parseTiming('Oct 2026 - Jan 2027', today)).toMatchObject({ kind: 'period', start: '2026-10-01', end: '2027-01-31' })
    expect(parseTiming('nov to feb', today)).toMatchObject({ kind: 'period', start: '2026-11-01', end: '2027-02-28' })
    expect(parseTiming('Q1 2027', today)).toMatchObject({ kind: 'period', start: '2027-01-01', end: '2027-03-31' })
    expect(parseTiming('second half of 2026', today)).toMatchObject({ kind: 'period', start: '2026-07-01', end: '2026-12-31' })
  })
  it('reads parts of a month', () => {
    expect(parseTiming('first three weeks of Sept 2026', today)).toMatchObject({ kind: 'period', start: '2026-09-01', end: '2026-09-21' })
    expect(parseTiming('mid November', today)).toMatchObject({ kind: 'period', start: '2026-11-11', end: '2026-11-20' })
    expect(parseTiming('end of February 2027', today)).toMatchObject({ kind: 'period', start: '2027-02-21', end: '2027-02-28' })
  })
  it('refuses vague text and keeps the raw string', () => {
    const t = parseTiming('after the rains', today)
    expect(t.kind).toBe('unresolved')
    expect(t.raw).toBe('after the rains')
  })
})
