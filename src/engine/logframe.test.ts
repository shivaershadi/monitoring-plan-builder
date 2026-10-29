import { describe, expect, it } from 'vitest'
import { matchLogframe, rowsToLines, splitLogframeText } from './logframe'
import { es } from './test-fixtures'

/** Rows as copied from "Mandatory indicator list for projects starting in 2026.xlsx" (cells separated by tabs). */
const MANDATORY_2026 = [
  'x6F5ACXtMFq\t\tShelter & Settlements\tEmergency Shelter\tOutcome\tUse of emergency shelter\t\tGL-SB403/FL\t\t0\t\t\t% of emergency shelters occupied by intended project participants within 1 month of hand-over',
  'OScYJ79Mo8O\t\tShelter & Settlements\tEmergency Shelter\tOutcome\tUse of household items as intended\tAt least one of the outcomes for this result (select the most appropriate)\tGL-SB702/FL\t\t0\t\t\t% of participant households who report / are observed using essential household items as intended within 1 month of provision (emergency shelter)',
  'WszILWCFCXt\t\tShelter & Settlements\tEmergency Shelter\tOutcome\tUse of household items as intended\tAt least one of the outcomes for this result (select the most appropriate)\tGL-SB922/FL\t\t0\t\t\t% of participant households who report/are observed using items purchased with cash for essential household items as intended within 1 month of distribution (versus trade, selling, etc.)',
  'o4jFydqz1Nc\t\tShelter & Settlements\tEmergency Shelter\tOutcome\tUse of shelter support as intended\tAt least one of the outcomes for this result (select the most appropriate)\tGL-SB201/FL\t\t0\t\t\t% of project participants who report / are observed utilizing shelter contribution as intended within 1 month of distribution (versus trade or selling, etc.) (emergency shelter)',
  'F0Z02uO9zDE\t\tShelter & Settlements\tEmergency Shelter\tOutcome\tUse of shelter support as intended\tAt least one of the outcomes for this result (select the most appropriate)\tGL-SB901/FL\t\t0\t\t\t% of project participants who report / are observed using items purchased with cash for shelter contribution as intended within 1 month of distribution (versus trade, selling, etc.) (emergency shelter)',
].join('\n')

describe('matchLogframe', () => {
  it('matches all five mandatory Emergency Shelter indicators pasted from the 2026 mandatory list', () => {
    const r = matchLogframe(splitLogframeText(MANDATORY_2026), [es])
    expect(r.map((m) => m.status)).toEqual(['matched', 'matched', 'matched', 'matched', 'matched'])
    expect(r.map((m) => m.indicator_id)).toEqual(['GL-SB403/FL', 'GL-SB702/FL', 'GL-SB922/FL', 'GL-SB201/FL', 'GL-SB901/FL'])
    expect(r.every((m) => m.by === 'id')).toBe(true)
  })
  it('matches the same five by title alone when the IDs are missing', () => {
    const titlesOnly = splitLogframeText(MANDATORY_2026).map((l) => l.split(/\s{2,}/).at(-1)!)
    const r = matchLogframe(titlesOnly, [es])
    expect(r.map((m) => m.indicator_id)).toEqual(['GL-SB403/FL', 'GL-SB702/FL', 'GL-SB922/FL', 'GL-SB201/FL', 'GL-SB901/FL'])
    expect(r.every((m) => m.by === 'title' && (m.score ?? 0) >= 0.6)).toBe(true)
  })
  it('matches by GORS UID, ignores case and spaces in IDs, and reports duplicates', () => {
    const r = matchLogframe(['Outcome x6F5ACXtMFq', 'gl-sb 702 / fl', 'GL-SB702/FL again'], [es])
    expect(r.map((m) => [m.status, m.indicator_id, m.by])).toEqual([
      ['matched', 'GL-SB403/FL', 'gors_uid'],
      ['matched', 'GL-SB702/FL', 'id'],
      ['duplicate', 'GL-SB702/FL', 'id'],
    ])
  })
  it('does not confuse an indicator from another TOC that shares the number', () => {
    const r = matchLogframe(['GL-SB201/SI % of recipients who report utilizing infrastructure contribution'], [es])
    expect(r[0].status).toBe('unmatched')
  })
  it('marks output indicators out of scope and suggested indicators as listed but unsupported', () => {
    const r = matchLogframe(['# of households receiving NFI kits', 'Output  Total number of people reached', 'GS-SB421/FL feel safe'], [es])
    expect(r.map((m) => m.status)).toEqual(['out_of_scope', 'out_of_scope', 'unsupported'])
  })
  it('turns spreadsheet rows into lines', () => {
    expect(rowsToLines([['GL-SB403/FL', null, '% occupied'], [], ['', '  ']])).toEqual(['GL-SB403/FL  % occupied'])
  })
})
