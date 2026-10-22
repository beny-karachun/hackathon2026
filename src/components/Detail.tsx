import { formatCell, rawCell } from '../lib/format'
import { legendEntry, tableFor } from '../lib/context'
import { DATASET_LABEL } from '../lib/columns'
import type { Cell, Database, DatasetId, Row } from '../types'

const GROUP_ORDER = ['Identity', 'Process', 'Economics', 'Scale', 'Scores', 'Stream context', 'Sponsors', 'Market', 'Quality', 'Other']

const ROUTE_EXTRAS = [
  'pretreatment_steps',
  'byproducts',
  'new_product_name',
  'new_product_family',
  'new_product_price_usd_per_kg',
  'new_price_basis',
  'new_price_source',
]

type Field = { source: string; column: string; value: Cell }

type Props = {
  db: Database
  dataset: DatasetId
  row: Row
  onClose: () => void
  onJump: (id: string) => void
  onAdd: () => void
}

export function Detail({ db, dataset, row, onClose, onJump, onAdd }: Props) {
  const { legendKey } = tableFor(db, dataset)
  const fields: Field[] = tableFor(db, dataset).table.columns.map((column) => ({
    source: legendKey,
    column,
    value: row[column],
  }))

  if (dataset === 'matrix' || dataset === 'route_value') {
    const route = db.routes.byId.get(String(row.route_id ?? ''))
    if (route) {
      for (const column of ROUTE_EXTRAS) {
        if (route[column] != null && route[column] !== '') fields.push({ source: 'routes', column, value: route[column] })
      }
    }
  }
  if (dataset === 'matrix') {
    const value = db.routeValue.byId.get(String(row.route_id ?? ''))
    if (value) {
      for (const column of ['availability_basis', 'faculty_fit', 'parent_stream_id', 'is_rollup', 'net_usd_per_yr_global_potential', 'net_usd_per_yr_israel_potential']) {
        if (value[column] != null && value[column] !== '' && row[column] == null) {
          fields.push({ source: 'route_value', column, value: value[column] })
        }
      }
      if (value.price_usd_per_kg != null && value.price_usd_per_kg !== row.price_usd_per_kg) {
        fields.push({ source: 'route_value', column: 'price_usd_per_kg', value: value.price_usd_per_kg })
      }
    }
  }

  const groups = new Map<string, Field[]>()
  for (const field of fields) {
    const entry = legendEntry(db, field.source === legendKey ? legendKey : field.source, field.column)
    const list = groups.get(entry.group) ?? []
    list.push(field)
    groups.set(entry.group, list)
  }

  const title =
    String(row.stream_name ?? row.name ?? row.canonical_name ?? row.product_name ?? row.route_id ?? row.id ?? row.__key)
  const subtitle = String(row.route_id ?? row.id ?? row.product_id ?? row.canonical_id ?? row.__key)
  const sponsors = db.sponsorsByStream.get(String(row.stream_id ?? row.id ?? '')) ?? []
  const audits = db.auditByRoute.get(String(row.route_id ?? '')) ?? []

  return (
    <aside className="detail" role="dialog" aria-label="Row detail">
      <header>
        <div>
          <p className="kicker">{DATASET_LABEL[dataset]}</p>
          <h2>{title}</h2>
          <p className="sub">
            <IdButton id={subtitle} onJump={onJump} />
          </p>
        </div>
        <div className="detail-actions">
          <button type="button" className="primary" onClick={onAdd}>
            Add to context
          </button>
          <button type="button" className="texty" onClick={onClose} aria-label="Close detail">
            Close
          </button>
        </div>
      </header>
      <div className="detail-body">
        {GROUP_ORDER.filter((group) => groups.has(group)).map((group) => (
          <section key={group}>
            <h3>{group}</h3>
            <dl>
              {(groups.get(group) ?? []).map((field) => {
                const entry = legendEntry(db, field.source === legendKey ? legendKey : field.source, field.column)
                return (
                  <div key={`${field.source}-${field.column}`}>
                    <dt title={entry.text}>
                      {entry.label}
                      {field.source !== legendKey && <span className="src">{field.source}</span>}
                    </dt>
                    <dd title={rawCell(field.value)}>
                      <Value value={field.value} column={field.column} onJump={onJump} />
                    </dd>
                  </div>
                )
              })}
            </dl>
          </section>
        ))}
        {sponsors.length > 0 && (
          <section>
            <h3>Sponsor links for this stream</h3>
            {sponsors.map((link) => (
              <article key={String(link.__key)} className="note-card">
                <strong>{String(link.sponsor)}</strong>
                <span>{String(link.sponsor_site ?? '')}</span>
                <p>{String(link.rationale ?? '')}</p>
                {link.already_done_warning ? <p className="warn">{String(link.already_done_warning)}</p> : null}
              </article>
            ))}
          </section>
        )}
        {audits.length > 0 && (
          <section>
            <h3>Reference audit</h3>
            {audits.map((audit) => (
              <article key={String(audit.__key)} className="note-card">
                <strong>{String(audit.column)}</strong>
                <p>{String(audit.removed ?? '')}</p>
                <p className="muted">{String(audit.reason ?? '')}</p>
              </article>
            ))}
          </section>
        )}
      </div>
    </aside>
  )
}

function Value({ value, column, onJump }: { value: Cell; column: string; onJump: (id: string) => void }) {
  if (value == null || value === '') return <>—</>
  const text = String(value)
  if (column.endsWith('_id') || column === 'id' || column === 'partner_stream_id' || column === 'canonical_product_id') {
    return <IdButton id={text} onJump={onJump} />
  }
  const shown = formatCell(column, value)
  const parts = shown.split(/(https?:\/\/[^\s,;]+)/g)
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('http') ? (
          <a key={index} href={part} target="_blank" rel="noreferrer">
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

function IdButton({ id, onJump }: { id: string; onJump: (id: string) => void }) {
  return (
    <button type="button" className="id-link" onClick={() => onJump(id)}>
      {id}
    </button>
  )
}
