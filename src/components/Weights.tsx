import { WEIGHT_FIELDS } from '../lib/score'

type Props = {
  weights: Record<string, number>
  onChange: (next: Record<string, number>) => void
}

export function Weights({ weights, onChange }: Props) {
  const active = Object.values(weights).some((value) => value > 0)
  return (
    <div className="weights">
      <p>
        Your score is a weighted average of percentiles inside the filtered list. A blank cell adds nothing for that
        slider. The original columns stay as stored.
      </p>
      <div className="weight-grid">
        {WEIGHT_FIELDS.map((field) => (
          <label key={field.col}>
            <span>
              {field.label}
              <b>{weights[field.col] ?? 0}</b>
            </span>
            <input
              type="range"
              min={0}
              max={5}
              step={1}
              value={weights[field.col] ?? 0}
              aria-label={field.label}
              onChange={(event) => onChange({ ...weights, [field.col]: Number(event.target.value) })}
            />
          </label>
        ))}
      </div>
      {active && (
        <button type="button" className="texty" onClick={() => onChange({})}>
          Reset weights
        </button>
      )}
    </div>
  )
}
