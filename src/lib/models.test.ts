import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, resolveEffort, resolveSettings } from './models'

describe('resolveEffort', () => {
  it('keeps the default Sol medium call', () => {
    const resolved = resolveSettings(DEFAULT_SETTINGS)
    expect(resolved.model).toBe('gpt-6.1-sol')
    expect(resolved.effort).toBe('medium')
    expect(resolved.note).toBeNull()
  })

  it('clamps Sol off none and minimal onto low', () => {
    expect(resolveEffort('gpt-6.1-sol', 'none')).toEqual({
      sent: 'low',
      note: 'GPT 6.1 Sol will be called with low, the closest level it accepts.',
    })
    expect(resolveEffort('gpt-6.1-sol', 'minimal').sent).toBe('low')
    expect(resolveEffort('gpt-6.1-sol', 'xhigh').sent).toBe('xhigh')
    expect(resolveEffort('gpt-6.1-sol', 'max').sent).toBe('max')
  })

  it('lets Luna use none and xhigh, and moves minimal up to low', () => {
    expect(resolveEffort('gpt-6-luna', 'none').sent).toBe('none')
    expect(resolveEffort('gpt-6-luna', 'xhigh').sent).toBe('xhigh')
    expect(resolveEffort('gpt-6-luna', 'minimal').sent).toBe('low')
  })

  it('sends a custom id with the slider value unchanged', () => {
    const resolved = resolveSettings({
      apiKey: '',
      modelChoice: 'custom',
      customModelId: 'my-model',
      effort: 'minimal',
    })
    expect(resolved.model).toBe('my-model')
    expect(resolved.effort).toBe('minimal')
    expect(resolved.note).toBeNull()
  })
})
