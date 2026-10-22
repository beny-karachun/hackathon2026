import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { linkifyIds } from './ids'

marked.setOptions({ gfm: true, breaks: true })

let hooked = false
function ensureHook() {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? ''
      if (href.startsWith('http')) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noreferrer')
      }
    }
  })
}

export function renderMarkdown(source: string): string {
  ensureHook()
  const html = marked.parse(linkifyIds(source), { async: false }) as string
  return DOMPurify.sanitize(html)
}
