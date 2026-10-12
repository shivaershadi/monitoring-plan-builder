import { describe, expect, it } from 'vitest'
import { censusRecommended, cochran, stratified } from './sampling'

describe('sampling', () => {
  it('matches the v1 prototype values', () => {
    expect(cochran({ population: 500, confidence: 95, margin: 5 })).toBe(218)
    expect(cochran({ population: 84, confidence: 95, margin: 5 })).toBe(70)
    expect(cochran({ population: 3400, confidence: 95, margin: 5 })).toBe(346)
    expect(cochran({ population: 1000, confidence: 90, margin: 10 })).toBe(64)
  })
  it('never exceeds the population', () => {
    expect(cochran({ population: 20, confidence: 95, margin: 5 })).toBe(20)
  })
  it('sums strata', () => {
    const r = stratified([{ name: 'IDPs', population: 300 }, { name: 'Hosts', population: 200 }], 95, 5)
    expect(r.perStratum.map((s) => s.n)).toEqual([169, 132])
    expect(r.total).toBe(301)
  })
  it('recommends a census for small frames', () => {
    expect(censusRecommended(24, 95, 5)).toBe(true)
    expect(censusRecommended(3400, 95, 5)).toBe(false)
  })
})
