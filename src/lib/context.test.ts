import { describe, expect, it } from 'vitest'
import { csvCell, estimateTokens, toCsv } from './context'
import { linkifyIds } from './ids'
import { compareCells, textHasSponsor } from './query'
import { percentileScores } from './score'
import type { Row } from '../types'

describe('context and table helpers', () => {
  it('quotes csv cells and leaves blanks empty', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a, "b"')).toBe('"a, ""b"""')
    const csv = toCsv(['route_id', 'notes'], [{ route_id: 'R01-0001', notes: 'line\n2', __key: 'R01-0001' }])
    expect(csv).toBe('route_id,notes\nR01-0001,"line\n2"')
  })

  it('estimates tokens from length and does not invent a score on the row', () => {
    expect(estimateTokens('abcd')).toBe(1)
    const row: Row = { __key: 'a', net_usd_per_kg_waste: 2, novelty_1to5: null }
    const other: Row = { __key: 'b', net_usd_per_kg_waste: 4, novelty_1to5: 5 }
    const before = JSON.stringify(row)
    const scores = percentileScores([row, other], { net_usd_per_kg_waste: 1, novelty_1to5: 1 }, (item) => String(item.__key))
    expect(JSON.stringify(row)).toBe(before)
    expect(scores.get('a')).toBeCloseTo(0)
    expect(scores.get('b')).toBeCloseTo(1)
  })

  it('sorts blanks last and matches sponsor aliases by token', () => {
    expect(compareCells(null, 1, 'asc')).toBe(1)
    expect(compareCells(2, 10, 'desc')).toBeGreaterThan(0)
    expect(textHasSponsor('CBC Israel;Tosaf', 'CBC Israel')).toBe(true)
    expect(textHasSponsor('CBC', 'CBC Israel')).toBe(true)
    expect(textHasSponsor('Strauss', 'Tnuva')).toBe(false)
  })

  it('turns ids into links and leaves urls alone', () => {
    const linked = linkifyIds('See R10-0200 and FOODAG-0021 at https://example.com/R10-0200')
    expect(linked).toContain('[R10-0200](#sidestream-R10-0200)')
    expect(linked).toContain('[FOODAG-0021](#sidestream-FOODAG-0021)')
    expect(linked).toContain('https://example.com/R10-0200')
    expect(linked).not.toContain('[https://example.com')
  })
})
