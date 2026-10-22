import { CONTEXT_BRIEF, DATASET_LABEL } from '../lib/columns'
import { columnsForSlice, legendEntry, serializeContext, tableFor } from '../lib/context'
import type { Database, DatasetId, Slice } from '../types'

type Props = {
  db: Database
  slices: Slice[]
  columns: Partial<Record<DatasetId, string[]>>
  onColumns: (next: Partial<Record<DatasetId, string[]>>) => void
  onRemove: (uid: string) => void
  onClear: () => void
}

export function ContextTray({ db, slices, columns, onColumns, onRemove, onClear }: Props) {
  const packed = serializeContext(db, slices, columns)
  const datasets = [...new Set(slices.map((slice) => slice.dataset))]
  return (
    <section className="tray" aria-label="Context sent to the model">
      <header>
        <h2>Context</h2>
        <p>
          {slices.length === 0
            ? 'Nothing loaded yet.'
            : `${packed.rows.toLocaleString('en-US')} rows · about ${packed.tokens.toLocaleString('en-US')} tokens`}
        </p>
        {slices.length > 0 && (
          <button type="button" className="texty" onClick={onClear}>
            Clear
          </button>
        )}
      </header>
      <div className="chips">
        {slices.map((slice) => (
          <span key={slice.uid} className="chip">
            {slice.label}
            <button type="button" aria-label={`Remove ${slice.label}`} onClick={() => onRemove(slice.uid)}>
              ×
            </button>
          </span>
        ))}
      </div>
      {packed.tokens > 80000 && (
        <p className="warn">This context is large. The call will be slow and expensive.</p>
      )}
      {datasets.length > 0 && (
        <details className="cols">
          <summary>Columns sent to the model</summary>
          <div className="preset-row">
            <button type="button" onClick={() => applyPreset(db, datasets, columns, onColumns, 'brief')}>
              Brief
            </button>
            <button type="button" onClick={() => applyPreset(db, datasets, columns, onColumns, 'economics')}>
              Economics
            </button>
            <button type="button" onClick={() => applyPreset(db, datasets, columns, onColumns, 'scores')}>
              Scores
            </button>
            <button type="button" onClick={() => applyPreset(db, datasets, columns, onColumns, 'all')}>
              All
            </button>
          </div>
          {datasets.map((dataset) => {
            const available = tableFor(db, dataset).table.columns
            const chosen = new Set(columnsForSlice(db, dataset, columns))
            return (
              <fieldset key={dataset}>
                <legend>{DATASET_LABEL[dataset]}</legend>
                <div className="col-grid">
                  {available.map((column) => (
                    <label key={column} title={legendEntry(db, tableFor(db, dataset).legendKey, column).text}>
                      <input
                        type="checkbox"
                        checked={chosen.has(column)}
                        onChange={() => {
                          const next = new Set(chosen)
                          if (next.has(column)) next.delete(column)
                          else next.add(column)
                          onColumns({ ...columns, [dataset]: [...next] })
                        }}
                      />
                      {legendEntry(db, tableFor(db, dataset).legendKey, column).label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )
          })}
        </details>
      )}
      <p className="fine">Tables are CSV with a column legend. The token count is approximate.</p>
    </section>
  )
}

const ECONOMICS = [
  'route_id',
  'stream_id',
  'stream_name',
  'product_name',
  'price_usd_per_kg',
  'yield_kg_per_kg_waste',
  'process_cost_usd_per_kg_waste',
  'gross_usd_per_kg_waste',
  'net_usd_per_kg_waste',
  'capped_net_usd_per_yr_global',
  'capped_net_usd_per_yr_israel',
  'uncapped_net_usd_per_yr_global',
  'market_share_needed',
  'product_market_usd_per_yr',
  'capex_class',
  'co2_avoided_kg_per_kg',
]

const SCORES = [
  'route_id',
  'stream_id',
  'stream_name',
  'product_name',
  'trl_1to9',
  'trl_fit_1to5',
  'novelty_1to5',
  'demo_feasibility_1to5',
  'israel_fit_1to5',
  'hackathon_fit_score',
  'route_confidence_1to5',
  'sanity_pass',
  'flags',
  'sponsor_stream_link',
  'israel_linked',
  'capex_class',
]

function applyPreset(
  db: Database,
  datasets: DatasetId[],
  current: Partial<Record<DatasetId, string[]>>,
  onColumns: (next: Partial<Record<DatasetId, string[]>>) => void,
  preset: 'brief' | 'economics' | 'scores' | 'all',
) {
  const next = { ...current }
  for (const dataset of datasets) {
    const available = tableFor(db, dataset).table.columns
    if (preset === 'all') next[dataset] = available
    else if (preset === 'brief') next[dataset] = CONTEXT_BRIEF[dataset]
    else if (preset === 'economics' && (dataset === 'matrix' || dataset === 'route_value')) next[dataset] = ECONOMICS
    else if (preset === 'scores' && (dataset === 'matrix' || dataset === 'route_value')) next[dataset] = SCORES
  }
  onColumns(next)
}
