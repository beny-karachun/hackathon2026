import { DEFAULT_SETTINGS, EFFORTS, type Effort, type ModelChoice, type Settings } from './models'
import type { DatasetId, Slice } from '../types'

const SETTINGS_KEY = 'sidestream.settings.v1'
const SESSION_KEY = 'sidestream.session.v1'

const CHOICES: ModelChoice[] = ['gpt-6.1-sol', 'gpt-6-luna', 'custom']

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    const effort = EFFORTS.includes(parsed.effort as Effort) ? (parsed.effort as Effort) : 'medium'
    const modelChoice = CHOICES.includes(parsed.modelChoice as ModelChoice)
      ? (parsed.modelChoice as ModelChoice)
      : 'gpt-6.1-sol'
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      modelChoice,
      customModelId: typeof parsed.customModelId === 'string' ? parsed.customModelId : '',
      effort,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

type SessionShape = {
  slices: Slice[]
  contextCols: Partial<Record<DatasetId, string[]>>
}

export function loadSession(): SessionShape {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return { slices: [], contextCols: {} }
    const parsed = JSON.parse(raw) as SessionShape
    return {
      slices: Array.isArray(parsed.slices) ? parsed.slices : [],
      contextCols: parsed.contextCols ?? {},
    }
  } catch {
    return { slices: [], contextCols: {} }
  }
}

export function saveSession(session: SessionShape) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    /* a very large basket can exceed the session quota; the page still works */
  }
}
