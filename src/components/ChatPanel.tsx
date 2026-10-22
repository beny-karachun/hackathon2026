import { useRef, useState, type MouseEvent } from 'react'
import { idFromHash } from '../lib/ids'
import { renderMarkdown } from '../lib/markdown'
import { resolveSettings, type Settings } from '../lib/models'
import {
  RESPONSES_URL,
  SYSTEM_PROMPT,
  buildHeaders,
  buildResponsesBody,
  consumeSse,
  explainHttpError,
  explainNetworkError,
  type ChatTurn,
} from '../lib/openai'

const STARTERS = [
  'Which of these is the best hackathon idea and why?',
  'Compare these routes on value, novelty, and whether a student team could demo them in 48 hours.',
  'What data is missing or doubtful here?',
  'Which sponsor would care, and what is already commercial?',
  'What should we drop before a 48-hour hackathon?',
]

type Msg = { id: string; role: 'user' | 'assistant'; text: string; error?: string }

type Props = {
  settings: Settings
  contextText: string
  contextTokens: number
  onOpenSettings: () => void
  onJump: (id: string) => void
}

export function ChatPanel({ settings, contextText, contextTokens, onOpenSettings, onJump }: Props) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const resolved = resolveSettings(settings)

  async function ask(question: string) {
    const text = question.trim()
    if (!text || busy) return
    if (!settings.apiKey.trim()) {
      onOpenSettings()
      return
    }
    if (resolved.missingModel) {
      onOpenSettings()
      return
    }
    const history: ChatTurn[] = messages
      .filter((message) => message.text && !message.error)
      .map((message) => ({ role: message.role, content: message.text }))
    const attached = contextText
      ? `${contextText}\n\n# Question\n${text}\n\nUse only the tables above for figures. Cite route ids and stream ids.`
      : `${text}\n\nNo data table was attached to this question.`
    const body = buildResponsesBody({
      model: resolved.model,
      effort: resolved.effort,
      instructions: SYSTEM_PROMPT,
      input: [...history, { role: 'user', content: attached }],
    })
    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', text },
      { id: assistantId, role: 'assistant', text: '' },
    ])
    setDraft('')
    setBusy(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await fetch(RESPONSES_URL, {
        method: 'POST',
        headers: buildHeaders(settings.apiKey.trim()),
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!response.ok) {
        const raw = await response.text()
        fail(assistantId, explainHttpError(response.status, raw))
        return
      }
      const reader = response.body?.getReader()
      if (!reader) {
        fail(assistantId, 'The browser did not receive a response stream.')
        return
      }
      const decoder = new TextDecoder()
      let rest = ''
      let acc = ''
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        rest += decoder.decode(chunk.value, { stream: true })
        const consumed = consumeSse(rest)
        rest = consumed.rest
        for (const effect of consumed.effects) {
          if (effect.type === 'delta') {
            acc += effect.text
            const next = acc
            setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, text: next } : message)))
          } else if (effect.type === 'error') {
            setMessages((prev) =>
              prev.map((message) => (message.id === assistantId ? { ...message, error: effect.message } : message)),
            )
          }
        }
      }
      if (!acc) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId && !message.error
              ? { ...message, error: 'The model returned no text. It may have spent the turn on reasoning, or the model id rejected the effort.' }
              : message,
          ),
        )
      }
    } catch (error) {
      const message = explainNetworkError(error)
      if (message !== 'Stopped.') fail(assistantId, message)
    } finally {
      setBusy(false)
      abortRef.current = null
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
      })
    }
  }

  function fail(id: string, error: string) {
    setMessages((prev) => prev.map((message) => (message.id === id ? { ...message, error } : message)))
  }

  function onClickCapture(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest('a')
    if (!anchor) return
    const id = idFromHash(anchor.getAttribute('href') ?? '')
    if (!id) return
    event.preventDefault()
    onJump(id)
  }

  return (
    <section className="chat" aria-label="Ask">
      <header>
        <h2>Ask</h2>
        <p>
          {resolved.label} · {resolved.effort}
          {resolved.effort !== settings.effort ? ` · slider is ${settings.effort}` : ''}
        </p>
      </header>
      <div className="thread" ref={listRef} onClick={onClickCapture}>
        {messages.length === 0 && (
          <div className="starters">
            <p>Add rows to the context tray, then ask about those rows. Click an id in an answer to open it.</p>
            {STARTERS.map((prompt) => (
              <button key={prompt} type="button" onClick={() => ask(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        )}
        {messages.map((message) => (
          <article key={message.id} className={`bubble ${message.role}`}>
            {message.role === 'assistant' ? (
              <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text || (busy ? '…' : '')) }} />
            ) : (
              <p>{message.text}</p>
            )}
            {message.error && <p className="error">{message.error}</p>}
          </article>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault()
          void ask(draft)
        }}
      >
        <p className="fine">
          {contextText
            ? `This question includes the tray, about ${contextTokens.toLocaleString('en-US')} tokens.`
            : 'No rows are in the tray. The model is told not to invent figures.'}
        </p>
        <div className="composer-row">
          <textarea
            value={draft}
            aria-label="Question"
            rows={2}
            placeholder="Ask about the rows in the tray"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void ask(draft)
              }
            }}
          />
          {busy ? (
            <button type="button" className="primary" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="primary" disabled={!draft.trim()}>
              Ask
            </button>
          )}
        </div>
      </form>
    </section>
  )
}
