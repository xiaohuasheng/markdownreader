export const DEFAULT_PRESENTATION_FONT_SIZE = 22
export const MIN_PRESENTATION_FONT_SIZE = 18
export const MAX_PRESENTATION_FONT_SIZE = 34
export const PRESENTATION_FONT_SIZE_STEP = 2
export const PRESENTATION_TOOLBAR_IDLE_DELAY = 3000

export function changePresentationFontSize(currentSize: number, direction: 1 | -1): number {
  const nextSize = currentSize + direction * PRESENTATION_FONT_SIZE_STEP

  return Math.min(MAX_PRESENTATION_FONT_SIZE, Math.max(MIN_PRESENTATION_FONT_SIZE, nextSize))
}

export function shouldSchedulePresentationToolbarCollapse(isPresentation: boolean, isCollapsed: boolean): boolean {
  return isPresentation && !isCollapsed
}
