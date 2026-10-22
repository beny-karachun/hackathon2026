import type { Cell, Database, DatasetId, Filters, Row, SortDir, SortKey, TableData } from '../types'

const SPONSOR_ALIASES: Record<string, string[]> = {
  Tnuva: ['Tnuva'],
  NVIDIA: ['NVIDIA'],
  Strauss: ['Strauss'],
  'Magnum (TMICC Israel)': ['Magnum (TMICC Israel)', 'Magnum'],
  'CBC Israel': ['CBC Israel', 'CBC'],
  Tosaf: ['Tosaf'],
}

const SEARCH_COLS: Record<DatasetId, string[]> = {
  streams: ['id', 'stream_name', 'sector', 'source_industry', 'description', 'main_components', 'current_fate', 'hazard_class', 'notes'],
  products: ['product_id', 'name', 'product_family', 'faculty_fit', 'description', 'notes', 'price_scale'],
  canonical: ['canonical_id', 'canonical_name', 'product_family', 'member_names', 'member_product_ids'],
  markets: ['canonical_id', 'product_name', 'basis', 'working'],
  sponsors: ['sponsor', 'sponsor_site', 'stream_id', 'stream_name', 'rationale', 'already_done_warning'],
  matrix: [
    'route_id',
    'stream_id',
    'stream_name',
    'product_id',
    'product_name',
    'product_family',
    'sector',
    'key_process',
    'mechanism',
    'notes',
    'flags',
    'sponsor_fit',
    'sponsor_stream_link',
    'sponsor_mentioned',
    'references',
    'route_origin',
  ],
  route_value: ['route_id', 'stream_id', 'stream_name', 'product_id', 'product_name', 'sector', 'mechanism', 'sponsor_fit', 'faculty_fit'],
}

export function rowId(row: Row): string {
  return String(row.__key ?? '')
}

export function textHasSponsor(field: string, sponsor: string): boolean {
  if (!field) return false
  const aliases = SPONSOR_ALIASES[sponsor] ?? [sponsor]
  const tokens = field.split(';').map((part) => part.trim())
  return tokens.some((token) => aliases.includes(token))
}

export function flagTokens(flags: Cell): string[] {
  if (typeof flags !== 'string' || !flags) return []
  return flags.split(';').map((part) => part.trim()).filter(Boolean)
}

export function filtersActive(filters: Filters): boolean {
  return Boolean(
    filters.q.trim() ||
      filters.sectors.length ||
      filters.sponsors.length ||
      filters.israel !== 'any' ||
      filters.sanity !== 'any' ||
      filters.noveltyMin != null ||
      filters.noveltyMax != null ||
      filters.trlMin != null ||
      filters.trlMax != null ||
      filters.flags.length ||
      filters.hideAlreadyDone ||
      filters.origins.length ||
      filters.capex.length ||
      filters.priceScales.length,
  )
}

function num(value: Cell): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function twinOf(db: Database, row: Row): Row | undefined {
  const id = row.route_id
  if (id == null) return undefined
  return db.matrix.byId.get(String(id))
}

function israelYes(dataset: DatasetId, row: Row, db: Database): boolean {
  if (dataset === 'matrix') return row.israel_linked === 1
  if (dataset === 'streams') return (num(row.israel_availability_t_per_yr) ?? 0) > 0
  if (dataset === 'route_value') {
    const twin = twinOf(db, row)
    if (twin) return twin.israel_linked === 1
    return (num(row.israel_availability_t_per_yr) ?? 0) > 0
  }
  if (dataset === 'sponsors') {
    const stream = db.streams.byId.get(String(row.stream_id ?? ''))
    return ((stream && num(stream.israel_availability_t_per_yr)) ?? 0) > 0
  }
  return true
}

function sponsorHit(dataset: DatasetId, row: Row, db: Database, sponsor: string): boolean {
  if (dataset === 'sponsors') return textHasSponsor(String(row.sponsor ?? ''), sponsor)
  if (dataset === 'streams') return db.streamsBySponsor.get(sponsor)?.has(String(row.id ?? '')) ?? false
  if (dataset === 'matrix' || dataset === 'route_value') {
    const source = dataset === 'matrix' ? row : (twinOf(db, row) ?? row)
    return (
      textHasSponsor(String(source.sponsor_stream_link ?? ''), sponsor) ||
      textHasSponsor(String(source.sponsor_mentioned ?? row.sponsor_fit ?? ''), sponsor) ||
      (db.streamsBySponsor.get(sponsor)?.has(String(row.stream_id ?? '')) ?? false)
    )
  }
  return false
}

const SECTOR_DATASETS = new Set<DatasetId>(['streams', 'matrix', 'route_value'])
const SPONSOR_DATASETS = new Set<DatasetId>(['streams', 'matrix', 'route_value', 'sponsors'])
const ISRAEL_DATASETS = new Set<DatasetId>(['streams', 'matrix', 'route_value', 'sponsors'])
const NOVELTY_DATASETS = new Set<DatasetId>(['products', 'matrix', 'route_value'])
const TRL_DATASETS = new Set<DatasetId>(['matrix', 'route_value'])
const FLAG_DATASETS = new Set<DatasetId>(['matrix', 'route_value'])
const ORIGIN_DATASETS = new Set<DatasetId>(['matrix', 'route_value'])
const CAPEX_DATASETS = new Set<DatasetId>(['matrix', 'route_value'])
const PRICE_DATASETS = new Set<DatasetId>(['products', 'canonical', 'matrix', 'route_value'])

export function rowMatches(row: Row, filters: Filters, dataset: DatasetId, db: Database): boolean {
  const q = filters.q.trim().toLowerCase()
  if (q) {
    const blob =
      (row.__search as string) ||
      SEARCH_COLS[dataset].map((col) => String(row[col] ?? '')).join('\n').toLowerCase()
    if (!blob.includes(q)) return false
  }
  if (filters.sectors.length && SECTOR_DATASETS.has(dataset) && !filters.sectors.includes(String(row.sector ?? ''))) {
    return false
  }
  if (
    filters.sponsors.length &&
    SPONSOR_DATASETS.has(dataset) &&
    !filters.sponsors.some((sponsor) => sponsorHit(dataset, row, db, sponsor))
  ) {
    return false
  }
  if (filters.israel !== 'any' && ISRAEL_DATASETS.has(dataset)) {
    const yes = israelYes(dataset, row, db)
    if (filters.israel === 'yes' && !yes) return false
    if (filters.israel === 'no' && yes) return false
  }
  if (filters.sanity !== 'any' && (dataset === 'matrix' || dataset === 'route_value')) {
    const source = dataset === 'matrix' ? row : twinOf(db, row)
    const pass = source?.sanity_pass === 1
    if (filters.sanity === 'pass' && !pass) return false
    if (filters.sanity === 'fail' && pass) return false
  }
  if (NOVELTY_DATASETS.has(dataset)) {
    const novelty = num(row.novelty_1to5)
    if (filters.noveltyMin != null && (novelty == null || novelty < filters.noveltyMin)) return false
    if (filters.noveltyMax != null && (novelty == null || novelty > filters.noveltyMax)) return false
  }
  if (TRL_DATASETS.has(dataset)) {
    const trl = num(row.trl_1to9)
    if (filters.trlMin != null && (trl == null || trl < filters.trlMin)) return false
    if (filters.trlMax != null && (trl == null || trl > filters.trlMax)) return false
  }
  if (FLAG_DATASETS.has(dataset) && (filters.flags.length || filters.hideAlreadyDone)) {
    const source = dataset === 'route_value' ? (twinOf(db, row) ?? row) : row
    const tokens = flagTokens(source.flags)
    if (filters.flags.length && !filters.flags.some((flag) => tokens.includes(flag))) return false
    if (filters.hideAlreadyDone && tokens.includes('already_done')) return false
  }
  if (filters.origins.length && ORIGIN_DATASETS.has(dataset) && !filters.origins.includes(String(row.route_origin ?? ''))) {
    return false
  }
  if (filters.capex.length && CAPEX_DATASETS.has(dataset) && !filters.capex.includes(String(row.capex_class ?? ''))) {
    return false
  }
  if (
    filters.priceScales.length &&
    PRICE_DATASETS.has(dataset) &&
    !filters.priceScales.includes(String(row.price_scale ?? ''))
  ) {
    return false
  }
  return true
}

export function filterRows(rows: Row[], filters: Filters, dataset: DatasetId, db: Database): Row[] {
  if (!filtersActive(filters)) return rows
  return rows.filter((row) => rowMatches(row, filters, dataset, db))
}

export function orderByIds(table: TableData, ids: string[]): Row[] {
  const out: Row[] = []
  for (const id of ids) {
    const row = table.byId.get(id)
    if (row) out.push(row)
  }
  return out
}

export function compareCells(a: Cell, b: Cell, dir: SortDir): number {
  const emptyA = a == null || a === ''
  const emptyB = b == null || b === ''
  if (emptyA && emptyB) return 0
  if (emptyA) return 1
  if (emptyB) return -1
  let cmp = 0
  if (typeof a === 'number' && typeof b === 'number') cmp = a - b
  else cmp = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
  return dir === 'asc' ? cmp : -cmp
}

export function sortRows(rows: Row[], sort: SortKey, scores?: Map<string, number>): Row[] {
  if (sort.key === 'rank') return sort.dir === 'asc' ? rows : [...rows].reverse()
  const out = [...rows]
  out.sort((a, b) => {
    if (sort.key === 'score') {
      return compareCells(scores?.get(rowId(a)) ?? null, scores?.get(rowId(b)) ?? null, sort.dir)
    }
    return compareCells(a[sort.key], b[sort.key], sort.dir)
  })
  return out
}

export function withSearch(row: Row, dataset: DatasetId): Row {
  const blob = SEARCH_COLS[dataset].map((col) => String(row[col] ?? '')).join('\n').toLowerCase()
  return { ...row, __search: blob }
}
