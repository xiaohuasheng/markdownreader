export type OpenBehavior = 'new-window' | 'replace-current'

export const DEFAULT_OPEN_BEHAVIOR: OpenBehavior = 'new-window'

export function parseOpenBehavior(value: unknown): OpenBehavior {
  return value === 'replace-current' || value === 'new-window' ? value : DEFAULT_OPEN_BEHAVIOR
}

export function shouldCreateWindowForOpen(
  behavior: OpenBehavior,
  targetWindowHasContent: boolean,
  forceNewWindow = false
): boolean {
  return forceNewWindow || (behavior === 'new-window' && targetWindowHasContent)
}
