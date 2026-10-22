import type { Meta } from '../types'

export function GuideDialog({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  return (
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div className="modal guide" role="dialog" aria-labelledby="guide-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2 id="guide-title">How to read the matrix</h2>
          <button type="button" className="texty" onClick={onClose}>
            Close
          </button>
        </header>
        <p>
          A <strong>route</strong> is one cell: a waste stream turned into a product. Ranked tabs are the database views,
          in the database’s order, until you sort a column.
        </p>
        <p>A blank cell is unknown. It is not a zero. Most money figures are estimates. Read confidence and flags before you pitch a number.</p>
        <h3>Scores</h3>
        <ul>
          <li>
            <strong>Novelty 1–5.</strong> 1 is textbook or already commercial, including a sponsor’s current practice. 5 has little precedent and still a plausible mechanism.
          </li>
          <li>
            <strong>Demo 1–5.</strong> 1 needs a plant or months. 5 is a benchtop result in hours.
          </li>
          <li>
            <strong>Israel fit 1–5.</strong> 1 is negligible in Israel. 5 is a major local stream with a sponsor or a strategic need.
          </li>
          <li>
            <strong>TRL 1–9</strong> is for this stream-to-product route. 9 is widespread commercial practice.
          </li>
          <li>
            <strong>TRL fit</strong> is higher for lab and pilot TRLs (3–5 map to 5) and lower for plants that already exist (8–9 map to 1).
          </li>
          <li>
            <strong>Hackathon fit</strong> adds novelty, demo, Israel fit, and TRL fit.
          </li>
          <li>
            <strong>Capex.</strong> A is under $1M, B $1–10M, C $10–100M, D over $100M.
          </li>
          <li>
            <strong>Confidence 1–5.</strong> 5 is sourced techno-economics. 1 is an order-of-magnitude guess.
          </li>
        </ul>
        <h3>Money</h3>
        <ul>
          {meta.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <h3>Sponsors</h3>
        <p>Platinum: Tnuva, NVIDIA, Strauss. Gold: Magnum (TMICC Israel), CBC Israel. Silver: Tosaf.</p>
        <p className="fine">{meta.place}</p>
      </div>
    </div>
  )
}
