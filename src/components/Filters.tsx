import type { DatasetId, Filters as FilterState } from '../types'
import { EMPTY_FILTERS } from '../types'
import { filtersActive } from '../lib/query'

type FlagOpt = { id: string; count: number; text: string }

type Props = {
  dataset: DatasetId
  filters: FilterState
  onChange: (next: FilterState) => void
  sectors: string[]
  sponsors: string[]
  flags: FlagOpt[]
}

const ORIGINS = ['candidate', 'creative', 'symbiosis']
const CAPEX = ['A', 'B', 'C', 'D']
const SCALES = ['bulk', 'specialty', 'research_quantity']

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function Filters({ dataset, filters, onChange, sectors, sponsors, flags }: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...filters, ...patch })
  const showSector = dataset === 'streams' || dataset === 'matrix' || dataset === 'route_value'
  const showSponsor = showSector || dataset === 'sponsors'
  const showIsrael = showSponsor
  const showRoute = dataset === 'matrix' || dataset === 'route_value'
  const showNovelty = showRoute || dataset === 'products'
  const showPrice = showRoute || dataset === 'products' || dataset === 'canonical'
  const active = filtersActive(filters)

  return (
    <div className="filters">
      <input
        className="search"
        placeholder="Search names, ids, notes, flags…"
        aria-label="Search"
        value={filters.q}
        onChange={(event) => set({ q: event.target.value })}
      />
      {showSector && (
        <Multi label="Sector" values={filters.sectors} options={sectors} onChange={(sectorsNext) => set({ sectors: sectorsNext })} />
      )}
      {showSponsor && (
        <Multi label="Sponsor" values={filters.sponsors} options={sponsors} onChange={(next) => set({ sponsors: next })} />
      )}
      {showIsrael && (
        <Select
          label="Israel"
          value={filters.israel}
          options={[
            ['any', 'Any place'],
            ['yes', dataset === 'streams' ? 'Has Israel tonnage' : 'Israel-linked'],
            ['no', dataset === 'streams' ? 'No Israel tonnage' : 'Not Israel-linked'],
          ]}
          onChange={(israel) => set({ israel: israel as FilterState['israel'] })}
        />
      )}
      {showRoute && (
        <Select
          label="Sanity"
          value={filters.sanity}
          options={[
            ['any', 'Any sanity'],
            ['pass', 'Sanity pass'],
            ['fail', 'Sanity fail'],
          ]}
          onChange={(sanity) => set({ sanity: sanity as FilterState['sanity'] })}
        />
      )}
      {showNovelty && (
        <Range
          label="Novelty"
          min={filters.noveltyMin}
          max={filters.noveltyMax}
          scale={5}
          onChange={(noveltyMin, noveltyMax) => set({ noveltyMin, noveltyMax })}
        />
      )}
      {showRoute && (
        <Range
          label="TRL"
          min={filters.trlMin}
          max={filters.trlMax}
          scale={9}
          onChange={(trlMin, trlMax) => set({ trlMin, trlMax })}
        />
      )}
      {showRoute && (
        <label className="checkline">
          <input
            type="checkbox"
            checked={filters.hideAlreadyDone}
            onChange={(event) => set({ hideAlreadyDone: event.target.checked })}
          />
          Hide already done
        </label>
      )}
      <details className="more">
        <summary>More filters</summary>
        <div className="more-body">
          {showRoute && (
            <Multi
              label="Flag"
              values={filters.flags}
              options={flags.map((flag) => flag.id)}
              captions={Object.fromEntries(flags.map((flag) => [flag.id, `${flag.text} (${flag.count.toLocaleString('en-US')})`]))}
              onChange={(next) => set({ flags: next })}
            />
          )}
          {showRoute && <Multi label="Origin" values={filters.origins} options={ORIGINS} onChange={(origins) => set({ origins })} />}
          {showRoute && <Multi label="Capex" values={filters.capex} options={CAPEX} onChange={(capex) => set({ capex })} />}
          {showPrice && (
            <Multi label="Price scale" values={filters.priceScales} options={SCALES} onChange={(priceScales) => set({ priceScales })} />
          )}
        </div>
      </details>
      {active && (
        <button type="button" className="texty" onClick={() => onChange(EMPTY_FILTERS)}>
          Clear filters
        </button>
      )}
    </div>
  )
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[][]
  onChange: (value: string) => void
}) {
  return (
    <label className="mini">
      <span>{label}</span>
      <select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  )
}

function Range({
  label,
  min,
  max,
  scale,
  onChange,
}: {
  label: string
  min: number | null
  max: number | null
  scale: number
  onChange: (min: number | null, max: number | null) => void
}) {
  const opts = [
    <option key="any" value="">
      Any
    </option>,
  ]
  for (let n = 1; n <= scale; n++) {
    opts.push(
      <option key={n} value={n}>
        {n}
      </option>,
    )
  }
  return (
    <label className="mini range">
      <span>{label}</span>
      <select
        aria-label={`${label} minimum`}
        value={min ?? ''}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null, max)}
      >
        {opts}
      </select>
      <span className="to">to</span>
      <select
        aria-label={`${label} maximum`}
        value={max ?? ''}
        onChange={(event) => onChange(min, event.target.value ? Number(event.target.value) : null)}
      >
        {opts}
      </select>
    </label>
  )
}

function Multi({
  label,
  values,
  options,
  captions,
  onChange,
}: {
  label: string
  values: string[]
  options: string[]
  captions?: Record<string, string>
  onChange: (next: string[]) => void
}) {
  const text = values.length === 0 ? label : values.length === 1 ? (captions?.[values[0]] ?? values[0]) : `${label} · ${values.length}`
  return (
    <details className="multi">
      <summary>{text}</summary>
      <div className="multi-menu">
        {options.map((option) => (
          <label key={option}>
            <input type="checkbox" checked={values.includes(option)} onChange={() => onChange(toggle(values, option))} />
            {captions?.[option] ?? option}
          </label>
        ))}
      </div>
    </details>
  )
}
