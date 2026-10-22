import type { Row } from '../types'

export const WEIGHT_FIELDS: { col: string; label: string }[] = [
  { col: 'hackathon_fit_score', label: 'Hackathon fit' },
  { col: 'novelty_1to5', label: 'Novelty' },
  { col: 'demo_feasibility_1to5', label: 'Demo feasibility' },
  { col: 'israel_fit_1to5', label: 'Israel fit' },
  { col: 'trl_fit_1to5', label: 'TRL fit' },
  { col: 'route_confidence_1to5', label: 'Confidence' },
  { col: 'net_usd_per_kg_waste', label: 'Net $/kg' },
  { col: 'capped_net_usd_per_yr_global', label: 'Capped global $/yr' },
  { col: 'capped_net_usd_per_yr_israel', label: 'Capped Israel $/yr' },
]

/** Percentile-weighted score inside the current row list. Does not write onto rows.
 *  Blank values add nothing for that slider. */
export function percentileScores(
  rows: Row[],
  weights: Record<string, number>,
  idOf: (row: Row) => string,
): Map<string, number> {
  const active = Object.entries(weights).filter(([, w]) => w > 0)
  const result = new Map<string, number>()
  if (!active.length || !rows.length) return result

  const pctByCol = new Map<string, Map<string, number>>()
  for (const [col] of active) {
    const present: { id: string; v: number }[] = []
    for (const row of rows) {
      const v = row[col]
      if (typeof v === 'number' && Number.isFinite(v)) present.push({ id: idOf(row), v })
    }
    present.sort((a, b) => a.v - b.v)
    const pct = new Map<string, number>()
    let i = 0
    while (i < present.length) {
      let j = i
      while (j < present.length && present[j].v === present[i].v) j++
      const mid = (i + (j - 1)) / 2
      const rank = present.length === 1 ? 1 : mid / (present.length - 1)
      for (let k = i; k < j; k++) pct.set(present[k].id, rank)
      i = j
    }
    pctByCol.set(col, pct)
  }

  const wsum = active.reduce((sum, [, w]) => sum + w, 0)
  for (const row of rows) {
    const id = idOf(row)
    let acc = 0
    for (const [col, w] of active) acc += w * (pctByCol.get(col)?.get(id) ?? 0)
    result.set(id, acc / wsum)
  }
  return result
}
