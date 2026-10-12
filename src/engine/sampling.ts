/** Sample size: Cochran with finite-population correction (ported from the v1 prototype), plus stratification. */

const Z: Record<number, number> = { 90: 1.645, 95: 1.96, 99: 2.576 }

export interface SamplingInput {
  population: number
  confidence: 90 | 95 | 99
  margin: number // percent, e.g. 5
  p?: number // expected proportion, default 0.5 (most conservative)
}

export function cochran({ population, confidence, margin, p = 0.5 }: SamplingInput): number {
  const z = Z[confidence] ?? 1.96
  const e = margin / 100
  const n0 = (z * z * p * (1 - p)) / (e * e)
  const n = population > 0 ? n0 / (1 + (n0 - 1) / population) : n0
  return Math.min(Math.ceil(n), population > 0 ? population : Math.ceil(n))
}

export interface Stratum {
  name: string
  population: number
}

/** Apply the same confidence and margin to each stratum separately and sum (toolkit rule). */
export function stratified(strata: Stratum[], confidence: 90 | 95 | 99, margin: number): { total: number; perStratum: Array<Stratum & { n: number }> } {
  const perStratum = strata.map((s) => ({ ...s, n: cochran({ population: s.population, confidence, margin }) }))
  return { total: perStratum.reduce((a, s) => a + s.n, 0), perStratum }
}

/** Census when the frame is small enough that sampling saves nothing. */
export function censusRecommended(population: number, confidence: 90 | 95 | 99, margin: number): boolean {
  return cochran({ population, confidence, margin }) >= population * 0.9
}
