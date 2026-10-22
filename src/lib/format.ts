import type { Cell } from '../types'

const YESNO = new Set(['sanity_pass', 'israel_linked', 'is_rollup'])

export function isNumericCol(col: string): boolean {
  return /(_1to\d|_usd_|_t_per_yr|_pct|score|share|yield|trl_|n_flags|n_member|moisture|co2_|price_|market_|sanity_pass|israel_linked|is_rollup|likelihood|output_t)/.test(
    col,
  )
}

export function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}k`
  return `${sign}$${trimNum(a)}`
}

export function formatTonnes(n: number): string {
  const sign = n < 0 ? '−' : ''
  const a = Math.abs(n)
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)} Gt`
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(2)} Mt`
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)} kt`
  return `${sign}${trimNum(a)} t`
}

export function formatShare(n: number): string {
  const abs = Math.abs(n)
  const digits = abs >= 10 ? 1 : abs >= 1 ? 2 : 3
  return `${n.toFixed(digits)}×`
}

export function trimNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e7 || abs < 0.001)) return n.toExponential(2)
  const digits = abs >= 100 ? 0 : abs >= 10 ? 2 : abs >= 1 ? 3 : 4
  return n.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
}

export function formatCell(col: string, value: Cell): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'string') return value
  if (YESNO.has(col)) return value === 1 ? 'Yes' : value === 0 ? 'No' : trimNum(value)
  if (col === 'market_share_needed') return formatShare(value)
  if (/usd_per_yr|market_usd_per_yr|market_size_usd_per_yr|product_market_usd_per_yr/.test(col)) {
    return formatMoney(value)
  }
  if (/t_per_yr|product_output_t_per_yr/.test(col)) return formatTonnes(value)
  if (/_1to\d|^trl_1to9$|n_flags|n_member|hackathon_fit_score/.test(col) && Number.isInteger(value)) {
    return String(value)
  }
  return trimNum(value)
}

export function rawCell(value: Cell): string {
  if (value == null || value === '') return ''
  return String(value)
}
