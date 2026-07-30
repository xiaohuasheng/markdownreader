function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0
  }

  return Math.min(1, Math.max(0, progress))
}

export function calculateScrollProgress(scrollOffset: number, scrollSize: number, viewportSize: number): number {
  const availableScroll = Math.max(0, scrollSize - viewportSize)

  if (availableScroll === 0) {
    return 0
  }

  return clampProgress(scrollOffset / availableScroll)
}

export function calculateScrollOffset(progress: number, scrollSize: number, viewportSize: number): number {
  const availableScroll = Math.max(0, scrollSize - viewportSize)

  return clampProgress(progress) * availableScroll
}
