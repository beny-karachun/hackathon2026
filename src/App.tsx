import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatPanel } from './components/ChatPanel'
import { ContextTray } from './components/ContextTray'
import { DataTable } from './components/DataTable'
import { Detail } from './components/Detail'
import { Filters } from './components/Filters'
import { GuideDialog } from './components/GuideDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { Weights } from './components/Weights'
import { DATASET_LABEL, TABLE_COLUMNS, pickColumns } from './lib/columns'
import { legendEntry, serializeContext, tableFor } from './lib/context'
import { loadDatabase } from './lib/load'
import type { Settings } from './lib/models'
import { filterRows, filtersActive, flagTokens, orderByIds, rowId, sortRows } from './lib/query'
import { percentileScores } from './lib/score'
import { loadSession, loadSettings, saveSession, saveSettings } from './lib/storage'
import { EMPTY_FILTERS, type Database, type DatasetId, type Filters as FilterState, type Slice, type SortKey } from './types'

const VIEWS = [
  'all',
  'v_rank_hackathon_fit',
  'v_rank_capped_global',
  'v_rank_net_per_kg',
  'v_rank_israel',
  'v_rank_sponsor_israel',
  'v_rank_capped_sanity',
  'v_top_per_stream',
] as const

function defaultSort(dataset: DatasetId, view: string): SortKey {
  if (dataset === 'matrix' && view !== 'all') return { key: 'rank', dir: 'asc' }
  if (dataset === 'matrix') return { key: 'hackathon_fit_score', dir: 'desc' }
  if (dataset === 'streams') return { key: 'israel_availability_t_per_yr', dir: 'desc' }
  if (dataset === 'products') return { key: 'price_usd_per_kg', dir: 'desc' }
  if (dataset === 'canonical') return { key: 'canonical_price_usd_per_kg', dir: 'desc' }
  if (dataset === 'markets') return { key: 'market_usd_per_yr', dir: 'desc' }
  if (dataset === 'route_value') return { key: 'net_usd_per_kg_waste', dir: 'desc' }
  return { key: 'likelihood_of_challenge_1to5', dir: 'desc' }
}

function locate(db: Database, id: string): { dataset: DatasetId; id: string } | null {
  if (db.matrix.byId.has(id)) return { dataset: 'matrix', id }
  if (db.streams.byId.has(id)) return { dataset: 'streams', id }
  if (db.products.byId.has(id)) return { dataset: 'products', id }
  if (db.canonical.byId.has(id)) return { dataset: 'canonical', id }
  if (db.markets.byId.has(id)) return { dataset: 'markets', id }
  if (db.routeValue.byId.has(id)) return { dataset: 'route_value', id }
  return null
}

export function App() {
  const [db, setDb] = useState<Database | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState('Loading the matrix…')
  const [dataset, setDataset] = useState<DatasetId>('matrix')
  const [view, setView] = useState('v_rank_hackathon_fit')
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [sort, setSort] = useState<SortKey>({ key: 'rank', dir: 'asc' })
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const session = useMemo(() => loadSession(), [])
  const [slices, setSlices] = useState<Slice[]>(session.slices)
  const [contextCols, setContextCols] = useState(session.contextCols)
  const [tableCols, setTableCols] = useState<Partial<Record<DatasetId, string[]>>>({})
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [showWeights, setShowWeights] = useState(false)
  const [detail, setDetail] = useState<{ dataset: DatasetId; id: string } | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [mobilePane, setMobilePane] = useState<'data' | 'context' | 'ask'>('data')
  const [sideOpen, setSideOpen] = useState(true)
  const [topN, setTopN] = useState(50)
  const anchor = useRef<string | null>(null)

  useEffect(() => {
    loadDatabase(setLoading)
      .then(setDb)
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)))
  }, [])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    saveSession({ slices, contextCols })
  }, [slices, contextCols])

  useEffect(() => {
    setSort(defaultSort(dataset, view))
  }, [dataset, view])

  useEffect(() => {
    if (!db) return
    const id = decodeURIComponent(location.hash.replace(/^#/, ''))
    if (!id || id === 'sidestream') return
    const hit = locate(db, id)
    if (!hit) return
    setDataset(hit.dataset)
    if (hit.dataset === 'matrix' && view !== 'all' && !(db.viewOrder[view] ?? []).includes(id)) setView('all')
    setDetail({ dataset: hit.dataset, id: hit.id })
    setHighlight(hit.id)
    // The view used above is the landing view. A hash should still open the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db])

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      for (const menu of document.querySelectorAll('details[open]')) {
        if (!menu.contains(target)) menu.removeAttribute('open')
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetail(null)
        setSettingsOpen(false)
        setGuideOpen(false)
      }
      const tag = (event.target as HTMLElement | null)?.tagName
      if (event.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('.search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const baseRows = useMemo(() => {
    if (!db) return []
    if (dataset === 'matrix' && view !== 'all') return orderByIds(db.matrix, db.viewOrder[view] ?? [])
    return tableFor(db, dataset).table.rows
  }, [db, dataset, view])
  const table = db ? tableFor(db, dataset) : null

  const filtered = useMemo(() => (db ? filterRows(baseRows, filters, dataset, db) : []), [db, baseRows, filters, dataset])
  const weightOn = dataset === 'matrix' && Object.values(weights).some((value) => value > 0)
  const scores = useMemo(
    () => (weightOn ? percentileScores(filtered, weights, rowId) : null),
    [weightOn, filtered, weights],
  )
  const sorted = useMemo(() => sortRows(filtered, sort, scores ?? undefined), [filtered, sort, scores])
  const columns = table ? pickColumns(table.table.columns, tableCols[dataset], TABLE_COLUMNS[dataset]) : []
  const selectedIds = selected[dataset] ?? []
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const packed = useMemo(
    () => (db ? serializeContext(db, slices, contextCols) : { text: '', tokens: 0, rows: 0 }),
    [db, slices, contextCols],
  )

  const sectors = useMemo(() => {
    if (!db) return []
    return [...new Set(db.streams.rows.map((row) => String(row.sector ?? '')).filter(Boolean))].sort()
  }, [db])
  const flagOptions = useMemo(() => {
    if (!db) return []
    const counts = new Map<string, number>()
    for (const row of db.matrix.rows) {
      for (const token of flagTokens(row.flags)) counts.set(token, (counts.get(token) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, count, text: db.meta.flags[id] ?? id }))
  }, [db])

  function openDataset(next: DatasetId, nextView = view) {
    setDataset(next)
    if (next === 'matrix') setView(nextView)
    setDetail(null)
    setHighlight(null)
    setMobilePane('data')
  }

  function focusId(id: string) {
    if (!db) return
    const hit = locate(db, id)
    if (!hit) {
      setBanner(`No row with id ${id} is in the loaded tables.`)
      return
    }
    const had = filtersActive(filters)
    if (hit.dataset === 'matrix') {
      const inView = view !== 'all' && (db.viewOrder[view] ?? []).includes(id)
      if (!inView) setView('all')
    }
    setDataset(hit.dataset)
    setFilters(EMPTY_FILTERS)
    setDetail(hit)
    setHighlight(hit.id)
    setMobilePane('data')
    setBanner(had ? `Showing ${id}. Filters were cleared so the row is visible.` : null)
    history.replaceState(null, '', `#${encodeURIComponent(id)}`)
  }

  function addSlice(label: string, ids: string[]) {
    const unique = [...new Set(ids)]
    if (!unique.length) return
    setSlices((prev) => [...prev.filter((slice) => slice.label !== label), { uid: crypto.randomUUID(), dataset, label, ids: unique }])
    setSideOpen(true)
    setMobilePane('context')
  }

  function viewTitle() {
    if (dataset === 'route_value') return 'Route value'
    if (dataset !== 'matrix') return DATASET_LABEL[dataset]
    if (view === 'all') return 'All routes'
    return db?.meta.views.find((item) => item.id === view)?.title ?? 'Routes'
  }

  const detailRow = db && detail ? tableFor(db, detail.dataset).table.byId.get(detail.id) : undefined
  const viewBlurb =
    dataset === 'route_value'
      ? 'Catalogue price and uncapped annual potential. Ranking prices live on the route matrix and can differ when a price was harmonised.'
      : dataset === 'matrix'
        ? view === 'all'
          ? 'Every route cell. Sorted by hackathon fit until you pick another column or a ranked view.'
          : (db?.meta.views.find((item) => item.id === view)?.description ?? '')
        : ''

  if (loadError) {
    return (
      <main className="boot">
        <h1>SideStream</h1>
        <p>{loadError}</p>
      </main>
    )
  }
  if (!db || !table) {
    return (
      <main className="boot">
        <p className="kicker">SideStream Hack 2026</p>
        <h1>Loading the matrix</h1>
        <p>{loading}</p>
      </main>
    )
  }

  return (
    <div className="app">
      <header className="mast">
        <div className="brand">
          <p className="kicker">Technion · 26–27 Nov 2026</p>
          <h1>SideStream</h1>
        </div>
        <nav className="tabs" aria-label="Datasets">
          <button type="button" className={dataset === 'streams' ? 'on' : ''} onClick={() => openDataset('streams')}>
            Streams
            <small>{db.meta.counts.streams.toLocaleString('en-US')}</small>
          </button>
          <button
            type="button"
            className={dataset === 'products' || dataset === 'canonical' || dataset === 'markets' ? 'on' : ''}
            onClick={() => openDataset('products')}
          >
            Products
            <small>{db.meta.counts.products.toLocaleString('en-US')}</small>
          </button>
          <button
            type="button"
            className={dataset === 'matrix' || dataset === 'route_value' ? 'on' : ''}
            onClick={() => openDataset('matrix', 'v_rank_hackathon_fit')}
          >
            Routes
            <small>{db.meta.counts.route_matrix.toLocaleString('en-US')}</small>
          </button>
          <button type="button" className={dataset === 'sponsors' ? 'on' : ''} onClick={() => openDataset('sponsors')}>
            Sponsors
            <small>{db.meta.counts.sponsor_streams.toLocaleString('en-US')}</small>
          </button>
        </nav>
        <div className="mast-actions">
          <button type="button" className="texty light" onClick={() => setGuideOpen(true)}>
            How to read
          </button>
          <button type="button" className="texty light" onClick={() => setSideOpen((open) => !open)}>
            {sideOpen ? 'Hide ask' : `Ask${slices.length ? ` · ${slices.length}` : ''}`}
          </button>
          <button type="button" className="texty light" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      <div className={`workspace ${sideOpen ? '' : 'side-shut'} pane-${mobilePane}`}>
        <div className="main">
          {(dataset === 'products' || dataset === 'canonical' || dataset === 'markets') && (
            <div className="views" role="tablist" aria-label="Product tables">
              <button type="button" className={dataset === 'products' ? 'on' : ''} onClick={() => openDataset('products')}>
                Catalogue · {db.meta.counts.products.toLocaleString('en-US')}
              </button>
              <button type="button" className={dataset === 'canonical' ? 'on' : ''} onClick={() => openDataset('canonical')}>
                Canonical · {db.meta.counts.product_canonical.toLocaleString('en-US')}
              </button>
              <button type="button" className={dataset === 'markets' ? 'on' : ''} onClick={() => openDataset('markets')}>
                Markets · {db.meta.counts.product_markets.toLocaleString('en-US')}
              </button>
            </div>
          )}
          {(dataset === 'matrix' || dataset === 'route_value') && (
            <div className="views" role="tablist" aria-label="Ranked views">
              {VIEWS.map((id) => {
                const meta = id === 'all' ? null : db.meta.views.find((item) => item.id === id)
                const title = id === 'all' ? 'All cells' : (meta?.title ?? id)
                const count = id === 'all' ? db.meta.counts.route_matrix : meta?.count
                return (
                  <button
                    key={id}
                    type="button"
                    className={dataset === 'matrix' && view === id ? 'on' : ''}
                    onClick={() => openDataset('matrix', id)}
                  >
                    {title}
                    {count != null && <small>{count.toLocaleString('en-US')}</small>}
                  </button>
                )
              })}
              <button
                type="button"
                className={dataset === 'route_value' ? 'on' : ''}
                onClick={() => openDataset('route_value')}
              >
                Route value
                <small>{db.meta.counts.route_value.toLocaleString('en-US')}</small>
              </button>
            </div>
          )}
          {viewBlurb && <p className="blurb">{viewBlurb}</p>}
          <Filters
            dataset={dataset}
            filters={filters}
            onChange={setFilters}
            sectors={sectors}
            sponsors={db.meta.sponsors}
            flags={flagOptions}
          />
          <div className="actionbar">
            <p className="count">
              {sorted.length.toLocaleString('en-US')} shown
              {sorted.length !== baseRows.length ? ` of ${baseRows.length.toLocaleString('en-US')}` : ''}
              {selectedIds.length > 0 ? ` · ${selectedIds.length.toLocaleString('en-US')} selected` : ''}
            </p>
            <button
              type="button"
              className="primary"
              disabled={selectedIds.length === 0}
              onClick={() => addSlice(`${viewTitle()} · ${selectedIds.length} selected`, selectedIds)}
            >
              Add selected
            </button>
            <label className="topn">
              Add top
              <input
                type="number"
                min={1}
                max={Math.max(1, sorted.length)}
                value={topN}
                aria-label="How many rows to add"
                onChange={(event) => setTopN(Number(event.target.value))}
              />
              <button
                type="button"
                onClick={() => {
                  const n = Math.max(1, Math.min(sorted.length, Math.floor(topN) || 1))
                  const sortNote = sort.key === 'rank' ? '' : sort.key === 'score' ? ' by your score' : ` by ${sort.key}`
                  const filteredNote = filtersActive(filters) ? ', filtered' : ''
                  addSlice(`${viewTitle()} · top ${n}${sortNote}${filteredNote}`, sorted.slice(0, n).map(rowId))
                }}
              >
                Add
              </button>
            </label>
            {dataset === 'matrix' && (
              <button type="button" className={showWeights ? 'on' : ''} onClick={() => setShowWeights((open) => !open)}>
                Weights
              </button>
            )}
            <details className="cols inline">
              <summary>Table columns</summary>
              <div className="col-grid">
                {table.table.columns.map((column) => (
                  <label key={column}>
                    <input
                      type="checkbox"
                      checked={columns.includes(column)}
                      onChange={() => {
                        const next = new Set(columns)
                        if (next.has(column)) next.delete(column)
                        else next.add(column)
                        setTableCols((prev) => ({ ...prev, [dataset]: [...next] }))
                      }}
                    />
                    {legendEntry(db, table.legendKey, column).label}
                  </label>
                ))}
              </div>
              <button type="button" className="texty" onClick={() => setTableCols((prev) => ({ ...prev, [dataset]: [] }))}>
                Reset columns
              </button>
            </details>
            {sort.key !== 'rank' && dataset === 'matrix' && view !== 'all' && (
              <button type="button" className="texty" onClick={() => setSort({ key: 'rank', dir: 'asc' })}>
                Rank order
              </button>
            )}
          </div>
          {banner && (
            <p className="banner">
              {banner}
              <button type="button" className="texty" onClick={() => setBanner(null)}>
                Dismiss
              </button>
            </p>
          )}
          {showWeights && dataset === 'matrix' && (
            <Weights
              weights={weights}
              onChange={(next) => {
                setWeights(next)
                if (Object.values(next).some((value) => value > 0)) setSort({ key: 'score', dir: 'desc' })
                else setSort(defaultSort(dataset, view))
              }}
            />
          )}
          <div className="stage">
            <DataTable
              rows={sorted}
              columns={columns}
              legend={(column) => legendEntry(db, table.legendKey, column)}
              selected={selectedSet}
              onToggle={(id, index, shift) => {
                setSelected((prev) => {
                  const cur = new Set(prev[dataset] ?? [])
                  if (shift && anchor.current) {
                    const from = sorted.findIndex((row) => rowId(row) === anchor.current)
                    if (from >= 0) {
                      const [lo, hi] = from < index ? [from, index] : [index, from]
                      for (let i = lo; i <= hi; i++) cur.add(rowId(sorted[i]))
                    }
                  } else if (cur.has(id)) cur.delete(id)
                  else cur.add(id)
                  anchor.current = id
                  return { ...prev, [dataset]: [...cur] }
                })
              }}
              onTogglePage={(checked) => setSelected((prev) => ({ ...prev, [dataset]: checked ? sorted.map(rowId) : [] }))}
              onOpen={(id) => {
                setDetail({ dataset, id })
                setHighlight(id)
              }}
              sort={sort}
              onSort={(key) =>
                setSort((prev) =>
                  prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'rank' ? 'asc' : 'desc' },
                )
              }
              highlight={highlight}
              scores={scores}
              showScore={weightOn}
            />
            {detailRow && detail && (
              <Detail
                db={db}
                dataset={detail.dataset}
                row={detailRow}
                onClose={() => setDetail(null)}
                onJump={focusId}
                onAdd={() => addSlice(`${DATASET_LABEL[detail.dataset]} · ${detail.id}`, [detail.id])}
              />
            )}
          </div>
        </div>
        <aside className="side">
            <ContextTray
              db={db}
              slices={slices}
              columns={contextCols}
              onColumns={setContextCols}
              onRemove={(uid) => setSlices((prev) => prev.filter((slice) => slice.uid !== uid))}
              onClear={() => setSlices([])}
            />
            <ChatPanel
              settings={settings}
              contextText={packed.text}
              contextTokens={packed.tokens}
              onOpenSettings={() => setSettingsOpen(true)}
              onJump={focusId}
            />
          </aside>
      </div>

      <nav className="mobile-bar" aria-label="Panels">
        <button type="button" className={mobilePane === 'data' ? 'on' : ''} onClick={() => setMobilePane('data')}>
          Data
        </button>
        <button type="button" className={mobilePane === 'context' ? 'on' : ''} onClick={() => { setSideOpen(true); setMobilePane('context') }}>
          Context{slices.length ? ` (${slices.length})` : ''}
        </button>
        <button type="button" className={mobilePane === 'ask' ? 'on' : ''} onClick={() => { setSideOpen(true); setMobilePane('ask') }}>
          Ask
        </button>
      </nav>

      {settingsOpen && (
        <SettingsDialog settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />
      )}
      {guideOpen && <GuideDialog meta={db.meta} onClose={() => setGuideOpen(false)} />}
    </div>
  )
}
