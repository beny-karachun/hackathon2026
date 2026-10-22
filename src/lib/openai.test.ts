import { describe, expect, it } from 'vitest'
import { buildHeaders, buildResponsesBody, consumeSse, explainHttpError } from './openai'

describe('Responses request shape', () => {
  it('matches the documented streaming body and leaves sampling params off', () => {
    const body = buildResponsesBody({
      model: 'gpt-6.1-sol',
      effort: 'medium',
      instructions: 'Be careful with blanks.',
      input: [{ role: 'user', content: 'Which route?' }],
    })
    expect(body).toEqual({
      model: 'gpt-6.1-sol',
      instructions: 'Be careful with blanks.',
      input: [{ role: 'user', content: 'Which route?' }],
      reasoning: { effort: 'medium' },
      stream: true,
      store: false,
    })
    expect(body).not.toHaveProperty('temperature')
    expect(body).not.toHaveProperty('top_p')
    expect(buildHeaders('sk-test')).toEqual({
      Authorization: 'Bearer sk-test',
      'Content-Type': 'application/json',
    })
  })

  it('reads output text deltas and surfaces API errors', () => {
    const buffer = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Hello"}',
      '',
      'data: {"type":"response.output_text.delta","delta":" route R01-0001"}',
      '',
      'data: {"type":"response.completed","response":{}}',
      '',
    ].join('\n')
    const { effects, rest } = consumeSse(buffer)
    expect(rest).toBe('')
    expect(effects).toEqual([
      { type: 'delta', text: 'Hello' },
      { type: 'delta', text: ' route R01-0001' },
      { type: 'done' },
    ])
    expect(explainHttpError(401, '{"error":{"message":"Incorrect API key","code":"invalid_api_key"}}')).toMatch(/rejected \(401\)/)
    expect(explainHttpError(404, '{"error":{"message":"no such model","code":"model_not_found"}}')).toMatch(/not found/)
  })
})
