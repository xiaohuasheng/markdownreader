export type EditorSearchMatch = {
  start: number
  end: number
}

export function findEditorSearchMatches(source: string, query: string): EditorSearchMatch[] {
  if (!query) {
    return []
  }

  const normalizedSource = source.toLocaleLowerCase()
  const normalizedQuery = query.toLocaleLowerCase()
  const matches: EditorSearchMatch[] = []
  let matchStart = normalizedSource.indexOf(normalizedQuery)

  while (matchStart !== -1) {
    matches.push({
      start: matchStart,
      end: matchStart + query.length
    })
    matchStart = normalizedSource.indexOf(normalizedQuery, matchStart + normalizedQuery.length)
  }

  return matches
}

export function calculateEditorMatchScrollTop(
  matchTop: number,
  matchHeight: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const availableScroll = Math.max(0, scrollHeight - clientHeight)
  const centeredScrollTop = matchTop + matchHeight / 2 - clientHeight / 2

  return Math.min(availableScroll, Math.max(0, centeredScrollTop))
}

export function getEditorSearchMatchLineNumber(source: string, matchStart: number): number {
  const safeMatchStart = Math.min(source.length, Math.max(0, matchStart))
  return source.slice(0, safeMatchStart).split('\n').length
}
