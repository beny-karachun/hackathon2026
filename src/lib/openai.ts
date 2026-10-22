import type { Effort } from './models'

export const RESPONSES_URL = 'https://api.openai.com/v1/responses'

export const SYSTEM_PROMPT = `You are the analyst for SideStream Hack 2026 (Technion, 26–27 November 2026, Carasso Center; Biotech & Food Engineering, Chemical Engineering, and Materials Science & Engineering).

The user is looking at a waste-stream × product matrix. A route is one cell: one waste stream turned into one product. Route ids look like R01-0001. Stream ids look like FOODAG-0001, CHEMBIO-0001, MATMIN-0001, URBANX-0001, or SPONSOR-0001. Product ids look like P0001 or PNEW-01-008.

Rules:
- Figures in the attached tables are often labelled estimates. Confidence runs from 1 (order-of-magnitude guess) to 5 (sourced techno-economics or plant data). Read the flags.
- A blank cell means unknown, not zero. Do not fill blanks with a number.
- Do not invent streams, products, sponsors, prices, yields, or references. If a figure is missing, say it is missing.
- Cite route_id and stream_id whenever you name a row, and product_id when it helps. The user can click those ids.
- Novelty 1, and notes that start with "ALREADY DONE BY", are baselines rather than hackathon pitches. The event wants ideas that are not already on the market.
- hackathon_fit_score = novelty + demo feasibility + Israel fit + TRL fit. TRL fit is highest for TRL 3–5 and lowest for TRL 8–9.
- sanity_pass = 1 is the stricter subset used by one ranking. It does not mean every number was measured.
- market_share_needed is a ratio. 1 means the route's priced global output equals the whole product market. Above 0.3 is flagged market_share_gt_30pct.
- gross $/kg = price × yield. net $/kg = gross − process cost. Uncapped global $/yr = net $/kg × global tonnes × 1000. Capped $/yr is that figure limited by the product market.
- Sponsors: Tnuva, NVIDIA, and Strauss (platinum); Magnum / TMICC Israel and CBC Israel (gold); Tosaf (silver).
- If no table is attached, say that no rows were loaded and do not quote figures from memory of this dataset.
- Be concrete. Name the best candidate in the attached rows and the main reason it could fail.`

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export function buildResponsesBody(args: {
  model: string
  effort: Effort | string
  instructions: string
  input: ChatTurn[]
}) {
  return {
    model: args.model,
    instructions: args.instructions,
    input: args.input,
    reasoning: { effort: args.effort },
    stream: true as const,
    store: false as const,
  }
}

export function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

export type SseEffect =
  | { type: 'delta'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export function consumeSse(buffer: string): { effects: SseEffect[]; rest: string } {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const effects: SseEffect[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const data = trimmed.slice(5).trim()
    if (!data) continue
    if (data === '[DONE]') {
      effects.push({ type: 'done' })
      continue
    }
    let evt: {
      type?: string
      delta?: string
      message?: string
      error?: { message?: string }
      response?: { error?: { message?: string }; incomplete_details?: { reason?: string } }
    }
    try {
      evt = JSON.parse(data) as typeof evt
    } catch {
      continue
    }
    if (evt.type === 'response.output_text.delta' && typeof evt.delta === 'string') {
      effects.push({ type: 'delta', text: evt.delta })
    } else if (evt.type === 'error') {
      effects.push({
        type: 'error',
        message: evt.message || evt.error?.message || 'The model stream returned an error.',
      })
    } else if (evt.type === 'response.failed') {
      effects.push({
        type: 'error',
        message: evt.response?.error?.message || 'The model failed to finish.',
      })
    } else if (evt.type === 'response.incomplete') {
      const reason = evt.response?.incomplete_details?.reason
      effects.push({
        type: 'error',
        message: reason ? `The response ended early (${reason}).` : 'The response ended early.',
      })
    } else if (evt.type === 'response.completed') {
      effects.push({ type: 'done' })
    }
  }
  return { effects, rest }
}

export function explainHttpError(status: number, raw: string): string {
  let message = raw.slice(0, 500)
  let code = ''
  try {
    const body = JSON.parse(raw) as { error?: { message?: string; code?: string } }
    message = body.error?.message || message
    code = body.error?.code || ''
  } catch {
    /* keep the raw snippet */
  }
  if (status === 401) return `The API key was rejected (401). ${message}`
  if (status === 403) return `The API refused this key (403). ${message}`
  if (status === 404 || code === 'model_not_found') {
    return `That model was not found. Check the model id in Settings. ${message}`
  }
  if (status === 429) return `The API rate limit or quota was hit (429). ${message}`
  if (status === 400) return `The API rejected the request (400). ${message}`
  return `The API returned ${status}. ${message}`
}

export function explainNetworkError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/abort/i.test(message)) return 'Stopped.'
  return `The browser could not complete the call to api.openai.com. ${message}`
}
