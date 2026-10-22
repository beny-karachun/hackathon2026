/** Model ids from OpenAI's model pages, October 2026.
 *  GPT 6.1 Sol: https://developers.openai.com/api/docs/models/gpt-6.1-sol
 *  GPT 6 Luna:  https://developers.openai.com/api/docs/models/gpt-6-luna
 *  Effort enum: https://developers.openai.com/api/docs/guides/reasoning
 */

export const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]

export type ModelChoice = 'gpt-6.1-sol' | 'gpt-6-luna' | 'custom'

export type Settings = {
  apiKey: string
  modelChoice: ModelChoice
  customModelId: string
  effort: Effort
}

type KnownModel = {
  choice: Exclude<ModelChoice, 'custom'>
  label: string
  id: string
  supports: readonly Effort[]
}

export const KNOWN_MODELS: readonly KnownModel[] = [
  {
    choice: 'gpt-6.1-sol',
    label: 'GPT 6.1 Sol',
    id: 'gpt-6.1-sol',
    supports: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    choice: 'gpt-6-luna',
    label: 'GPT 6 Luna',
    id: 'gpt-6-luna',
    supports: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
  },
]

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  modelChoice: 'gpt-6.1-sol',
  customModelId: '',
  effort: 'medium',
}

export function modelIdOf(settings: Settings): string {
  if (settings.modelChoice === 'custom') return settings.customModelId.trim()
  return settings.modelChoice
}

export function modelLabel(settings: Settings): string {
  if (settings.modelChoice === 'custom') return settings.customModelId.trim() || 'Custom model'
  return KNOWN_MODELS.find((m) => m.choice === settings.modelChoice)?.label ?? settings.modelChoice
}

export function supportedEfforts(modelId: string): readonly Effort[] | null {
  return KNOWN_MODELS.find((m) => m.id === modelId)?.supports ?? null
}

/** Snap an effort to the closest level the model accepts. Ties move up the scale
 *  (minimal → low), matching OpenAI's advice to replace minimal with low. */
export function resolveEffort(modelId: string, effort: Effort): { sent: Effort; note: string | null } {
  const known = KNOWN_MODELS.find((m) => m.id === modelId)
  if (!known || known.supports.includes(effort)) return { sent: effort, note: null }
  const idx = EFFORTS.indexOf(effort)
  let best: Effort = known.supports[0]
  let bestDist = Infinity
  for (const candidate of known.supports) {
    const dist = Math.abs(EFFORTS.indexOf(candidate) - idx)
    const higherTie = dist === bestDist && EFFORTS.indexOf(candidate) > EFFORTS.indexOf(best)
    if (dist < bestDist || higherTie) {
      best = candidate
      bestDist = dist
    }
  }
  return {
    sent: best,
    note: `${known.label} will be called with ${best}, the closest level it accepts.`,
  }
}

export function resolveSettings(settings: Settings): {
  model: string
  effort: Effort
  note: string | null
  label: string
  missingModel: boolean
} {
  const model = modelIdOf(settings)
  if (!model) {
    return {
      model: '',
      effort: settings.effort,
      note: 'Enter a model id to call a custom model.',
      label: 'Custom model',
      missingModel: true,
    }
  }
  const resolved = resolveEffort(model, settings.effort)
  return {
    model,
    effort: resolved.sent,
    note: resolved.note,
    label: modelLabel(settings),
    missingModel: false,
  }
}
