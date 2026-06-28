/**
 * Chat message helper utilities
 */

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  oldLineNum?: number
  newLineNum?: number
  text: string
}

export interface ToolCallInfo {
  id: string
  name: string
  args: string
  diff?: { oldText: string; newText: string; filePath?: string } | null
}

/**
 * Compute Longest Common Subsequence for diff
 */
export function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const result: string[] = []
  let i = m,
    j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1])
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return result
}

/**
 * Compute diff lines from old and new text
 */
export function computeDiffLines(
  oldText: string,
  newText: string,
  maxLines = 200
): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // Skip expensive LCS for large diffs
  if (oldLines.length + newLines.length > maxLines) {
    const result: DiffLine[] = []
    let oldLineNum = 1
    for (const line of oldLines) {
      result.push({ type: 'remove', oldLineNum: oldLineNum++, text: line })
    }
    let newLineNum = 1
    for (const line of newLines) {
      result.push({ type: 'add', newLineNum: newLineNum++, text: line })
    }
    return result
  }

  const result: DiffLine[] = []
  const lcs = computeLCS(oldLines, newLines)

  let oldIdx = 0
  let newIdx = 0
  let lcsIdx = 0
  let oldLineNum = 1
  let newLineNum = 1

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (
      lcsIdx < lcs.length &&
      oldIdx < oldLines.length &&
      newIdx < newLines.length &&
      oldLines[oldIdx] === lcs[lcsIdx] &&
      newLines[newIdx] === lcs[lcsIdx]
    ) {
      result.push({ type: 'context', oldLineNum: oldLineNum++, newLineNum: newLineNum++, text: oldLines[oldIdx] })
      oldIdx++
      newIdx++
      lcsIdx++
    } else if (lcsIdx < lcs.length && oldIdx < oldLines.length && oldLines[oldIdx] === lcs[lcsIdx]) {
      while (newIdx < newLines.length && newLines[newIdx] !== lcs[lcsIdx]) {
        result.push({ type: 'add', newLineNum: newLineNum++, text: newLines[newIdx] })
        newIdx++
      }
    } else if (lcsIdx < lcs.length && newIdx < newLines.length && newLines[newIdx] === lcs[lcsIdx]) {
      while (oldIdx < oldLines.length && oldLines[oldIdx] !== lcs[lcsIdx]) {
        result.push({ type: 'remove', oldLineNum: oldLineNum++, text: oldLines[oldIdx] })
        oldIdx++
      }
    } else {
      while (oldIdx < oldLines.length && (lcsIdx >= lcs.length || oldLines[oldIdx] !== lcs[lcsIdx])) {
        result.push({ type: 'remove', oldLineNum: oldLineNum++, text: oldLines[oldIdx] })
        oldIdx++
      }
      while (newIdx < newLines.length && (lcsIdx >= lcs.length || newLines[newIdx] !== lcs[lcsIdx])) {
        result.push({ type: 'add', newLineNum: newLineNum++, text: newLines[newIdx] })
        newIdx++
      }
    }
  }

  return result
}

/**
 * Extract code blocks from text
 */
export function extractCodeBlocks(
  text: string
): Array<{ code: string; language: string; filename?: string }> {
  const blocks: Array<{ code: string; language: string; filename?: string }> = []
  const regex = /```(\w+)?\s*(?:filename="([^"]+)")?\s*\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      filename: match[2],
      code: match[3].trim(),
    })
  }
  return blocks
}

/**
 * Get text without code blocks
 */
export function getTextWithoutCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').trim()
}
