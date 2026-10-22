import { useState } from 'react'
import { EFFORTS, KNOWN_MODELS, resolveSettings, supportedEfforts, type Settings } from '../lib/models'
import {
  RESPONSES_URL,
  buildHeaders,
  buildResponsesBody,
  consumeSse,
  explainHttpError,
  explainNetworkError,
} from '../lib/openai'

type Props = {
  settings: Settings
  onChange: (next: Settings) => void
  onClose: () => void
}

export function SettingsDialog({ settings, onChange, onClose }: Props) {
  const [showKey, setShowKey] = useState(false)
  const [confirmForget, setConfirmForget] = useState(false)
  const [testState, setTestState] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const resolved = resolveSettings(settings)
  const supports = settings.modelChoice === 'custom' ? supportedEfforts(settings.customModelId.trim()) : supportedEfforts(settings.modelChoice)

  async function testCall() {
    if (!settings.apiKey.trim()) {
      setTestState('Paste an API key first.')
      return
    }
    if (resolved.missingModel) {
      setTestState('Enter a model id first.')
      return
    }
    setTesting(true)
    setTestState(`Calling ${resolved.model} with reasoning.effort ${resolved.effort}…`)
    const body = buildResponsesBody({
      model: resolved.model,
      effort: resolved.effort,
      instructions: 'Reply with exactly the word pong.',
      input: [{ role: 'user', content: 'ping' }],
    })
    try {
      const response = await fetch(RESPONSES_URL, {
        method: 'POST',
        headers: buildHeaders(settings.apiKey.trim()),
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        setTestState(explainHttpError(response.status, await response.text()))
        return
      }
      const reader = response.body?.getReader()
      if (!reader) {
        setTestState('The browser did not receive a stream.')
        return
      }
      const decoder = new TextDecoder()
      let rest = ''
      let text = ''
      let error = ''
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        rest += decoder.decode(chunk.value, { stream: true })
        const consumed = consumeSse(rest)
        rest = consumed.rest
        for (const effect of consumed.effects) {
          if (effect.type === 'delta') text += effect.text
          if (effect.type === 'error') error = effect.message
        }
      }
      setTestState(
        error
          ? error
          : `The call reached the API. Model ${resolved.model}, reasoning.effort ${resolved.effort}. Reply: ${text.trim() || '(no text)'}`,
      )
    } catch (error) {
      setTestState(explainNetworkError(error))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="settings-title">Model settings</h2>
          <button type="button" className="texty" onClick={onClose}>
            Close
          </button>
        </header>
        <label className="stack">
          API key
          <span className="key-row">
            <input
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={settings.apiKey}
              placeholder="sk-…"
              onChange={(event) => onChange({ ...settings, apiKey: event.target.value })}
            />
            <button type="button" onClick={() => setShowKey((value) => !value)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        <p className="fine">
          The key stays in this browser (localStorage). It is sent only to api.openai.com. Requests set store to false.
          GitHub Pages never sees it.
        </p>
        <div className="forget-row">
          {confirmForget ? (
            <>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  onChange({ ...settings, apiKey: '' })
                  setConfirmForget(false)
                  setTestState('Key removed from this browser.')
                }}
              >
                Confirm forget key
              </button>
              <button type="button" className="texty" onClick={() => setConfirmForget(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="texty" onClick={() => setConfirmForget(true)} disabled={!settings.apiKey}>
              Forget key
            </button>
          )}
        </div>

        <label className="stack">
          Model
          <select
            value={settings.modelChoice}
            onChange={(event) => onChange({ ...settings, modelChoice: event.target.value as Settings['modelChoice'] })}
          >
            {KNOWN_MODELS.map((model) => (
              <option key={model.id} value={model.choice}>
                {model.label}
              </option>
            ))}
            <option value="custom">Custom model id</option>
          </select>
        </label>
        {settings.modelChoice === 'custom' && (
          <label className="stack">
            Model id
            <input
              value={settings.customModelId}
              placeholder="gpt-6.1-sol"
              spellCheck={false}
              onChange={(event) => onChange({ ...settings, customModelId: event.target.value })}
            />
          </label>
        )}
        <p className="fine">
          Calls use <code>{resolved.model || '…'}</code>. GPT 6.1 Sol accepts low through max. GPT 6 Luna also accepts
          none. A custom id is sent exactly as the slider shows, unless that id is one of these two models.
        </p>

        <div className="stack">
          <span>Reasoning intensity</span>
          <input
            type="range"
            min={0}
            max={EFFORTS.length - 1}
            step={1}
            value={EFFORTS.indexOf(settings.effort)}
            aria-label="Reasoning intensity"
            aria-valuetext={settings.effort}
            onChange={(event) => onChange({ ...settings, effort: EFFORTS[Number(event.target.value)] })}
          />
          <div className="ticks">
            {EFFORTS.map((effort) => {
              const faded = supports != null && !supports.includes(effort)
              return (
                <button
                  key={effort}
                  type="button"
                  className={effort === settings.effort ? 'on' : faded ? 'faded' : ''}
                  onClick={() => onChange({ ...settings, effort })}
                >
                  {effort}
                </button>
              )
            })}
          </div>
          {resolved.note && <p className="clamp">{resolved.note}</p>}
        </div>

        <div className="test-row">
          <button type="button" className="primary" onClick={() => void testCall()} disabled={testing}>
            {testing ? 'Calling…' : 'Test connection'}
          </button>
          {testState && <p className="test-result">{testState}</p>}
        </div>
      </div>
    </div>
  )
}
