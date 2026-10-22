export type Cell = string | number | null
export type Row = Record<string, Cell>

export type TableData = {
  columns: string[]
  rows: Row[]
  byId: Map<string, Row>
  idKey: string
}

export type LegendEntry = { label: string; group: string; text: string }

export type ViewMeta = {
  id: string
  title: string
  description: string
  count: number
}

export type Meta = {
  title: string
  event: string
  place: string
  format: string
  counts: Record<string, number>
  views: ViewMeta[]
  legend: Record<string, Record<string, LegendEntry>>
  flags: Record<string, string>
  notes: string[]
  sponsors: string[]
}

export type DatasetId =
  | 'streams'
  | 'products'
  | 'canonical'
  | 'markets'
  | 'sponsors'
  | 'matrix'
  | 'route_value'

export type Database = {
  meta: Meta
  viewOrder: Record<string, string[]>
  streams: TableData
  products: TableData
  routes: TableData
  matrix: TableData
  routeValue: TableData
  canonical: TableData
  markets: TableData
  sponsors: TableData
  audit: TableData
  sponsorsByStream: Map<string, Row[]>
  auditByRoute: Map<string, Row[]>
  streamsBySponsor: Map<string, Set<string>>
}

export type SortDir = 'asc' | 'desc'

export type SortKey = { key: 'rank' | 'score' | string; dir: SortDir }

export type Filters = {
  q: string
  sectors: string[]
  sponsors: string[]
  israel: 'any' | 'yes' | 'no'
  sanity: 'any' | 'pass' | 'fail'
  noveltyMin: number | null
  noveltyMax: number | null
  trlMin: number | null
  trlMax: number | null
  flags: string[]
  hideAlreadyDone: boolean
  origins: string[]
  capex: string[]
  priceScales: string[]
}

export type Slice = {
  uid: string
  dataset: DatasetId
  label: string
  ids: string[]
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  sectors: [],
  sponsors: [],
  israel: 'any',
  sanity: 'any',
  noveltyMin: null,
  noveltyMax: null,
  trlMin: null,
  trlMax: null,
  flags: [],
  hideAlreadyDone: false,
  origins: [],
  capex: [],
  priceScales: [],
}
