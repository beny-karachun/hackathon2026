import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const matrix = JSON.parse(readFileSync('data/route_matrix.json', 'utf8')) as {
  columns: string[]
  rows: (string | number | null)[][]
}
const meta = JSON.parse(readFileSync('data/meta.json', 'utf8')) as {
  counts: Record<string, number>
  views: { id: string; count: number }[]
}
const order = JSON.parse(readFileSync('data/view_order.json', 'utf8')) as Record<string, string[]>

describe('exported matrix', () => {
  it('keeps database counts and view order', () => {
    expect(matrix.rows.length).toBe(5293)
    expect(meta.counts.route_matrix).toBe(5293)
    expect(meta.counts.streams).toBe(1135)
    expect(meta.counts.product_canonical).toBe(2457)
    expect(order.v_rank_hackathon_fit.length).toBe(2350)
    expect(order.v_rank_hackathon_fit[0]).toBe('R10-0200')
    for (const view of meta.views) expect(order[view.id].length).toBe(view.count)
  })

  it('does not alter a stored gross value', () => {
    const index = Object.fromEntries(matrix.columns.map((column, i) => [column, i]))
    const row = matrix.rows.find((candidate) => candidate[index.route_id] === 'R01-0001')
    expect(row).toBeTruthy()
    const price = row![index.price_usd_per_kg] as number
    const yieldKg = row![index.yield_kg_per_kg_waste] as number
    const gross = row![index.gross_usd_per_kg_waste] as number
    expect(gross).toBeCloseTo(price * yieldKg, 6)
    expect(row![index.hackathon_fit_score]).toBe(
      (row![index.novelty_1to5] as number) +
        (row![index.demo_feasibility_1to5] as number) +
        (row![index.israel_fit_1to5] as number) +
        (row![index.trl_fit_1to5] as number),
    )
  })
})
