import type { DocumentKind } from '../preload/preload'

export function getDocumentPreviewContent(
  kind: DocumentKind,
  persistedContent: string,
  draft: string
): string {
  return kind === 'html' ? persistedContent : draft
}
