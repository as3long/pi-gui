/**
 * Session helper functions
 */

export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    // Convert to Beijing time (UTC+8)
    const bj = new Date(date.getTime() + (8 * 60 + date.getTimezoneOffset()) * 60000)
    const m = bj.getMonth() + 1
    const d = bj.getDate()
    const hh = String(bj.getHours()).padStart(2, '0')
    const mm = String(bj.getMinutes()).padStart(2, '0')
    return `${m}/${d} ${hh}:${mm}`
  } catch {
    return dateStr
  }
}

export function shortenPath(path: string): string {
  if (!path) return ''
  // Convert Windows path format to readable
  const readable = path.replace(/--/g, ':\\').replace(/-/g, '/')
  // Show last 2 parts of path
  const parts = readable.split('/').filter(Boolean)
  if (parts.length <= 3) return readable
  return '...' + parts.slice(-3).join('/')
}

export interface SessionMetadata {
  sessionId: string
  timestamp: string
  cwd: string
  name?: string
  model?: string
  provider?: string
  messageCount: number
}

export interface SessionItem {
  id: string
  path: string
  name?: string
  cwd?: string
  createdAt?: string
  messageCount?: number
  model?: string
  provider?: string
}
