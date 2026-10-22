const TOKEN =
  /```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s)]+|\b(?:R\d{2}-\d+|(?:FOODAG|CHEMBIO|MATMIN|URBANX|SPONSOR)-\d+|PNEW-\d{2}-\d+|PC[0-9A-F]{8}|P\d{4})\b/g

export function linkifyIds(text: string): string {
  return text.replace(TOKEN, (match) => {
    if (match.startsWith('`') || match.startsWith('http')) return match
    return `[${match}](#sidestream-${match})`
  })
}

export function idFromHash(href: string): string | null {
  const marker = '#sidestream-'
  const at = href.indexOf(marker)
  if (at === -1) return null
  return decodeURIComponent(href.slice(at + marker.length))
}
