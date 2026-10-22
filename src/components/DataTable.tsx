import { useEffect, useRef, useState } from 'react'
import { formatCell, isNumericCol, rawCell } from '../lib/format'
import { rowId } from '../lib/query'
import type { LegendEntry, Row, SortKey } from '../types'

const ROW_H = 36

type Props = {
  rows: Row[]
  columns: string[]
  legend: (col: string) => LegendEntry
  selected: Set<string>
  onToggle: (id: string, index: number, shift: boolean) => void
  onTogglePage: (checked: boolean) => void
  onOpen: (id: string) => void
  sort: SortKey
  onSort: (key: string) => void
  highlight: string | null
  scores: Map<string, number> | null
  showScore: boolean
}

export function DataTable({
  rows,
  columns,
  legend,
  selected,
  onToggle,
  onTogglePage,
  onOpen,
  sort,
  onSort,
  highlight,
  scores,
  showScore,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(480)
  const cols = showScore ? ['__score', ...columns] : columns
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(rowId(row)))

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => setHeight(el.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!highlight || !scroller.current) return
    const index = rows.findIndex((row) => rowId(row) === highlight)
    if (index < 0) return
    const top = index * ROW_H
    const el = scroller.current
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - ROW_H) {
      el.scrollTop = Math.max(0, top - ROW_H * 2)
    }
  }, [highlight, rows])

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 10)
  const count = Math.ceil(height / ROW_H) + 22
  const slice = rows.slice(start, start + count)
  const padTop = start * ROW_H
  const padBot = Math.max(0, (rows.length - start - slice.length) * ROW_H)

  return (
    <div
      className="table-scroll"
      ref={scroller}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <table className="grid">
        <thead>
          <tr>
            <th className="sticky check">
              <input
                type="checkbox"
                checked={allSelected}
                aria-label={allSelected ? 'Clear selection' : 'Select all shown rows'}
                onChange={(event) => onTogglePage(event.target.checked)}
              />
            </th>
            {cols.map((col) => {
              const active = sort.key === (col === '__score' ? 'score' : col)
              const entry = col === '__score' ? { label: 'Your score', text: 'Percentile mix of the weight sliders, inside this filtered list.' } : legend(col)
              return (
                <th key={col} className={isNumericCol(col) || col === '__score' ? 'num' : ''} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" title={entry.text} onClick={() => onSort(col === '__score' ? 'score' : col)}>
                    {entry.label}
                    {active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && (
            <tr className="pad" style={{ height: padTop }}>
              <td colSpan={cols.length + 1} />
            </tr>
          )}
          {slice.map((row, offset) => {
            const index = start + offset
            const id = rowId(row)
            const stripe = index % 2 === 1 ? 'alt' : ''
            const classes = [stripe, selected.has(id) ? 'selected' : '', highlight === id ? 'focused' : '']
              .filter(Boolean)
              .join(' ')
            return (
              <tr key={id} className={classes} onClick={() => onOpen(id)}>
                <td className="sticky check">
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    aria-label={`Select ${id}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      event.preventDefault()
                      onToggle(id, index, event.shiftKey)
                    }}
                  />
                </td>
                {cols.map((col) => {
                  if (col === '__score') {
                    const score = scores?.get(id)
                    return (
                      <td key={col} className="num">
                        {score == null ? '—' : Math.round(score * 100)}
                      </td>
                    )
                  }
                  const text = formatCell(col, row[col])
                  return (
                    <td key={col} className={isNumericCol(col) ? 'num' : ''} title={rawCell(row[col]) || text}>
                      {text}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {padBot > 0 && (
            <tr className="pad" style={{ height: padBot }}>
              <td colSpan={cols.length + 1} />
            </tr>
          )}
        </tbody>
      </table>
      {rows.length === 0 && <p className="empty">Nothing matches these filters.</p>}
    </div>
  )
}
