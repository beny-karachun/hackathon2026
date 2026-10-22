import { withSearch } from './query'
import type { Cell, Database, DatasetId, Meta, Row, TableData } from '../types'

type Payload = { columns: string[]; rows: Cell[][] }

function hydrate(payload: Payload, idKey: string | null, dataset: DatasetId | null): TableData {
  const rows: Row[] = payload.rows.map((arr, index) => {
    const row: Row = {}
    payload.columns.forEach((col, i) => {
      row[col] = arr[i] ?? null
    })
    const id = idKey != null && row[idKey] != null ? String(row[idKey]) : `row-${index}`
    row.__key = id
    return dataset ? withSearch(row, dataset) : row
  })
  const byId = new Map<string, Row>()
  for (const row of rows) byId.set(String(row.__key), row)
  return { columns: payload.columns, rows, byId, idKey: idKey ?? '__key' }
}

async function fetchJson<T>(name: string, onProgress: (label: string) => void): Promise<T> {
  onProgress(name)
  const response = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!response.ok) throw new Error(`Could not load data/${name} (${response.status}).`)
  return (await response.json()) as T
}

export async function loadDatabase(onProgress: (label: string) => void): Promise<Database> {
  const files = {
    meta: fetchJson<Meta>('meta.json', onProgress),
    viewOrder: fetchJson<Record<string, string[]>>('view_order.json', onProgress),
    streams: fetchJson<Payload>('streams.json', onProgress),
    products: fetchJson<Payload>('products.json', onProgress),
    routes: fetchJson<Payload>('routes.json', onProgress),
    matrix: fetchJson<Payload>('route_matrix.json', onProgress),
    routeValue: fetchJson<Payload>('route_value.json', onProgress),
    canonical: fetchJson<Payload>('product_canonical.json', onProgress),
    markets: fetchJson<Payload>('product_markets.json', onProgress),
    sponsors: fetchJson<Payload>('sponsor_streams.json', onProgress),
    audit: fetchJson<Payload>('reference_audit.json', onProgress),
  }
  const loaded = await Promise.all(Object.values(files))
  const [meta, viewOrder, streamsP, productsP, routesP, matrixP, routeValueP, canonicalP, marketsP, sponsorsP, auditP] =
    loaded as [
      Meta,
      Record<string, string[]>,
      Payload,
      Payload,
      Payload,
      Payload,
      Payload,
      Payload,
      Payload,
      Payload,
      Payload,
    ]

  const streams = hydrate(streamsP, 'id', 'streams')
  const products = hydrate(productsP, 'product_id', 'products')
  const routes = hydrate(routesP, 'route_id', null)
  const matrix = hydrate(matrixP, 'route_id', 'matrix')
  const routeValue = hydrate(routeValueP, 'route_id', 'route_value')
  const canonical = hydrate(canonicalP, 'canonical_id', 'canonical')
  const markets = hydrate(marketsP, 'canonical_id', 'markets')
  const sponsors = hydrate(sponsorsP, null, 'sponsors')
  const audit = hydrate(auditP, 'route_id', null)

  const sponsorsByStream = new Map<string, Row[]>()
  const streamsBySponsor = new Map<string, Set<string>>()
  for (const row of sponsors.rows) {
    const streamId = String(row.stream_id ?? '')
    const sponsor = String(row.sponsor ?? '')
    if (streamId) {
      const list = sponsorsByStream.get(streamId) ?? []
      list.push(row)
      sponsorsByStream.set(streamId, list)
    }
    if (sponsor && streamId) {
      const set = streamsBySponsor.get(sponsor) ?? new Set<string>()
      set.add(streamId)
      streamsBySponsor.set(sponsor, set)
    }
  }
  const auditByRoute = new Map<string, Row[]>()
  for (const row of audit.rows) {
    const routeId = String(row.route_id ?? '')
    if (!routeId) continue
    const list = auditByRoute.get(routeId) ?? []
    list.push(row)
    auditByRoute.set(routeId, list)
  }

  return {
    meta,
    viewOrder,
    streams,
    products,
    routes,
    matrix,
    routeValue,
    canonical,
    markets,
    sponsors,
    audit,
    sponsorsByStream,
    auditByRoute,
    streamsBySponsor,
  }
}
