import { describe, expect, it } from 'vitest'
import { suggestActivities } from './activityMatch'
import { dice, tokens } from './text'
import { es } from './test-fixtures'

const top = (text: string) => suggestActivities(text, [es])[0]?.activity.id

describe('suggestActivities', () => {
  it('maps everyday descriptions to the standard activity through the synonym table', () => {
    expect(top('We gave out tarpaulins and rope')).toBe('es_shelter_contribution')
    expect(top('distributed blankets and kitchen sets')).toBe('es_nfi_distribution')
    expect(top('family tents handed over in the camp')).toBe('es_whole_shelter')
    expect(top('fuel-efficient stoves')).toBe('es_energy')
    expect(top('Build Back Safer training for carpenters')).toBe('es_training')
  })
  it('suggests nothing for activities outside the encoded catalogue', () => {
    expect(suggestActivities('school feeding programme', [es])).toEqual([])
    expect(suggestActivities('   ', [es])).toEqual([])
  })
  it('reports which phrase matched', () => {
    expect(suggestActivities('plastic sheeting', [es])[0]).toMatchObject({ matched: 'plastic sheeting', score: 1 })
  })
})

describe('text helpers', () => {
  it('drops placeholders, punctuation, stop words and plurals', () => {
    expect(tokens('% of shelters occupied within {occupancy_window} of hand-over')).toEqual(['shelter', 'occupied', 'hand', 'over'])
  })
  it('scores identical token sets 1 and disjoint ones 0', () => {
    expect(dice(['a', 'b'], ['b', 'a'])).toBe(1)
    expect(dice(['a'], ['b'])).toBe(0)
  })
})
