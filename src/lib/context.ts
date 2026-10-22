import { CONTEXT_BRIEF, DATASET_LABEL, pickColumns } from './columns'
import type { Database, DatasetId, LegendEntry, Row, Slice } from '../types'

export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(columns: string[], rows: Row[]): string {
  const lines = [columns.map((col) => csvCell(col)).join(',')]
  for (const row of rows) lines.push(columns.map((col) => csvCell(row[col] ?? null)).join(','))
  return lines.join('\n')
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export function tableFor(db: Database, dataset: DatasetId) {
  switch (dataset) {
    case 'streams':
      return { table: db.streams, legendKey: 'streams' }
    case 'products':
      return { table: db.products, legendKey: 'products' }
    case 'canonical':
      return { table: db.canonical, legendKey: 'product_canonical' }
    case 'markets':
      return { table: db.markets, legendKey: 'product_markets' }
    case 'sponsors':
      return { table: db.sponsors, legendKey: 'sponsor_streams' }
    case 'matrix':
      return { table: db.matrix, legendKey: 'route_matrix' }
    case 'route_value':
      return { table: db.routeValue, legendKey: 'route_value' }
  }
}

export function legendEntry(db: Database, legendKey: string, column: string): LegendEntry {
  return (
    db.meta.legend[legendKey]?.[column] ?? {
      label: column.replaceAll('_', ' '),
      group: 'Other',
      text: `${column}, exported as stored.`,
    }
  )
}

export function columnsForSlice(
  db: Database,
  dataset: DatasetId,
  chosen: Partial<Record<DatasetId, string[]>>,
): string[] {
  const { table } = tableFor(db, dataset)
  return pickColumns(table.columns, chosen[dataset], CONTEXT_BRIEF[dataset])
}

export function serializeContext(
  db: Database,
  slices: Slice[],
  chosen: Partial<Record<DatasetId, string[]>>,
): { text: string; tokens: number; rows: number } {
  if (!slices.length) return { text: '', tokens: 0, rows: 0 }
  const parts: string[] = [
    '# SideStream Hack 2026 context',
    'Blank cells mean unknown, not zero. Do not treat a blank as 0.',
    'Numbers are the stored estimates. Confidence and flags say how firm they are.',
  ]
  let rows = 0
  for (const slice of slices) {
    const { table, legendKey } = tableFor(db, slice.dataset)
    const found = slice.ids.map((id) => table.byId.get(id)).filter((row): row is Row => Boolean(row))
    const columns = columnsForSlice(db, slice.dataset, chosen)
    rows += found.length
    parts.push(`## ${slice.label}`)
    parts.push(`Dataset: ${DATASET_LABEL[slice.dataset]}. Rows: ${found.length}.`)
    parts.push('### Column legend')
    for (const column of columns) {
      const entry = legendEntry(db, legendKey, column)
      parts.push(`- ${column}: ${entry.text}`)
    }
    parts.push('### Data')
    parts.push(toCsv(columns, found))
    if (slice.dataset === 'matrix' || slice.dataset === 'route_value') {
      const audits = found.flatMap((row) => db.auditByRoute.get(String(row.route_id ?? '')) ?? [])
      if (audits.length) {
        parts.push('### Reference audit (text removed from these routes)')
        parts.push(toCsv(['route_id', 'column', 'removed', 'reason'], audits))
      }
    }
  }
  const text = parts.join('\n')
  return { text, tokens: estimateTokens(text), rows }
}
