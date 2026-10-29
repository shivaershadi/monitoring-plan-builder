import { describe, expect, it } from 'vitest'
import { buildBoard, coverage, selectedIndicatorIds, type ActivityRef } from './selection'
import { es } from './test-fixtures'

const shelter: ActivityRef = { id: 'a1', activity_id: 'es_whole_shelter', label: 'Emergency shelter provision', modalities: ['in-kind'] }
const contribution = (m: ActivityRef['modalities']): ActivityRef => ({ id: 'a2', activity_id: 'es_shelter_contribution', label: 'Shelter contribution', modalities: m })
const nfi = (m: ActivityRef['modalities']): ActivityRef => ({ id: 'a3', activity_id: 'es_nfi_distribution', label: 'NFI distribution', modalities: m })

describe('buildBoard', () => {
  it('pre-selects and locks the five mandatory Emergency Shelter indicators for three mixed-modality activities', () => {
    const board = buildBoard([es], [shelter, contribution(['in-kind', 'CVA']), nfi(['in-kind', 'CVA'])], [])
    const mandatory = board.filter((e) => e.origin === 'mandatory')
    expect(mandatory.map((e) => e.indicator.id).sort()).toEqual(['GL-SB201/FL', 'GL-SB403/FL', 'GL-SB702/FL', 'GL-SB901/FL', 'GL-SB922/FL'])
    expect(mandatory.every((e) => e.selected && e.locked)).toBe(true)
    expect(selectedIndicatorIds(board).sort()).toEqual(mandatory.map((e) => e.indicator.id).sort())
  })
  it('resolves the "at least one of" modality bundles from the activity modality', () => {
    const board = buildBoard([es], [contribution(['in-kind']), nfi(['CVA'])], [])
    const sel = selectedIndicatorIds(board)
    expect(sel).toContain('GL-SB201/FL')
    expect(sel).not.toContain('GL-SB901/FL')
    expect(sel).toContain('GL-SB922/FL')
    expect(sel).not.toContain('GL-SB702/FL')
    const cva = board.find((e) => e.indicator.id === 'GL-SB901/FL')!
    expect(cva.applies).toBe(false)
    expect(cva.reason).toMatch(/For CVA/)
  })
  it('offers suggested indicators for the same results, unselected and marked not supported', () => {
    const board = buildBoard([es], [shelter], [])
    const safe = board.find((e) => e.indicator.id === 'GS-SB421/FL')!
    expect(safe).toMatchObject({ origin: 'suggested', selected: false, supported: false, applies: true })
    expect(coverage(board)).toEqual({ tocs: 1, mandatory: 1, suggested: 3, not_supported: 3 })
  })
  it('keeps a removed mandatory indicator unselected and unlocked, with its note', () => {
    const board = buildBoard([es], [shelter], [{ id: 'GL-SB403/FL', origin: 'mandatory', state: 'removed', removal_note: 'Handover cancelled' }])
    const e = board.find((x) => x.indicator.id === 'GL-SB403/FL')!
    expect(e).toMatchObject({ selected: false, locked: false, removed: true, removal_note: 'Handover cancelled' })
  })
  it('shows logframe indicators even before an activity serves them', () => {
    const board = buildBoard([es], [], [{ id: 'GL-SB702/FL', origin: 'logframe', state: 'selected' }])
    const e = board.find((x) => x.indicator.id === 'GL-SB702/FL')!
    expect(e).toMatchObject({ origin: 'logframe', selected: true, applies: false, locked: false })
    expect(e.reason).toMatch(/No activity on the canvas serves it yet/)
    expect(board).toHaveLength(1)
  })
})
