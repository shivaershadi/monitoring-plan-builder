/**
 * Logframe import: match pasted lines or spreadsheet rows to bank indicators.
 * 1. Exact indicator ID (spaces ignored, case-insensitive) or GORS UID.
 * 2. Otherwise the title: Dice token overlap with the bank title (placeholders removed) of at least 0.6.
 * Output-level lines are reported as out of scope. Deterministic; no model.
 */
import type { BankPackage, Indicator } from '@bank/schema/bank'
import { dice, tokens } from './text'

export const TITLE_MATCH_THRESHOLD = 0.6

export type LogframeStatus = 'matched' | 'unsupported' | 'unmatched' | 'out_of_scope' | 'duplicate'

export interface LogframeMatch {
  line: number
  text: string
  status: LogframeStatus
  indicator_id?: string
  by?: 'id' | 'gors_uid' | 'title'
  score?: number
  /** Other indicators whose title also passed the threshold, best first. */
  alternatives?: Array<{ indicator_id: string; score: number }>
  reason?: string
}

/** Pasted text to candidate lines; tabs (cells copied from Excel) become spaces. */
export function splitLogframeText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\t+/g, '  ').trim())
    .filter((l) => l.length > 0)
}

/** Spreadsheet rows (arrays of cells) to lines. */
export function rowsToLines(rows: unknown[][]): string[] {
  return rows.map((r) => r.map((c) => (c == null ? '' : String(c).trim())).filter(Boolean).join('  ')).filter((l) => l.length > 0)
}

const compact = (s: string) => s.toUpperCase().replace(/\s+/g, '')

/**
 * Every run of up to five neighbouring words, joined without spaces, so "GL-SB 702 / FL" still reads as
 * GL-SB702/FL while separate cells ("GL-SB702/FL  0") never run together.
 */
function codeCandidates(line: string): Set<string> {
  const words = line
    .split(/\s+/)
    .map((w) => w.replace(/^[("'[,;:]+|[)"'\],;:.]+$/g, ''))
    .filter(Boolean)
  const out = new Set<string>()
  for (let i = 0; i < words.length; i++) {
    let joined = ''
    for (let j = i; j < Math.min(words.length, i + 5); j++) out.add((joined += words[j].toUpperCase()))
  }
  return out
}

const OUTPUT_LINE = /^\s*(#|no\.|number of|total #|total number)/i

export function matchLogframe(lines: string[], packages: BankPackage[]): LogframeMatch[] {
  const indicators: Indicator[] = packages.flatMap((p) => p.indicators)
  const titleTokens = new Map(indicators.map((i) => [i.id, tokens(i.title_template)]))
  const taken = new Set<string>()
  const results: LogframeMatch[] = []

  lines.forEach((text, idx) => {
    const line = idx + 1
    const codes = codeCandidates(text)
    let ind: Indicator | undefined = indicators.find((i) => codes.has(compact(i.id)))
    let by: LogframeMatch['by'] = ind ? 'id' : undefined
    if (!ind) {
      ind = indicators.find((i) => i.gors_uid && codes.has(compact(i.gors_uid)))
      if (ind) by = 'gors_uid'
    }
    let score: number | undefined
    let alternatives: LogframeMatch['alternatives']
    if (!ind && OUTPUT_LINE.test(text)) {
      results.push({ line, text, status: 'out_of_scope', reason: 'Output indicator: outside the scope of this tool.' })
      return
    }
    if (!ind) {
      const words = tokens(text)
      const ranked = indicators
        .map((i) => ({ indicator_id: i.id, score: dice(titleTokens.get(i.id) ?? [], words) }))
        .filter((r) => r.score >= TITLE_MATCH_THRESHOLD)
        .sort((a, b) => b.score - a.score)
      if (ranked.length) {
        ind = indicators.find((i) => i.id === ranked[0].indicator_id)
        by = 'title'
        score = Math.round(ranked[0].score * 100) / 100
        if (ranked.length > 1) alternatives = ranked.slice(1).map((r) => ({ indicator_id: r.indicator_id, score: Math.round(r.score * 100) / 100 }))
      }
    }

    if (!ind) {
      const outputish = OUTPUT_LINE.test(text) || /\boutput\b/i.test(text)
      results.push({
        line,
        text,
        status: outputish ? 'out_of_scope' : 'unmatched',
        reason: outputish ? 'Output indicator: outside the scope of this tool.' : 'No indicator in the bank matches this line.',
      })
      return
    }
    if (taken.has(ind.id)) {
      results.push({ line, text, status: 'duplicate', indicator_id: ind.id, by, score, reason: `${ind.id} is already matched on an earlier line.` })
      return
    }
    taken.add(ind.id)
    if (ind.level === 'Output') {
      results.push({ line, text, status: 'out_of_scope', indicator_id: ind.id, by, score, reason: 'Output indicator: outside the scope of this tool.' })
      return
    }
    results.push({
      line,
      text,
      status: ind.support === 'supported' ? 'matched' : 'unsupported',
      indicator_id: ind.id,
      by,
      score,
      alternatives,
      reason: ind.support === 'supported' ? undefined : 'In the bank, but its questions are not yet encoded. You can request content.',
    })
  })
  return results
}
