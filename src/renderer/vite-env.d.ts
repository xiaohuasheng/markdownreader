/// <reference types="vite/client" />

import type { MarkdownReaderApi } from '../preload/preload'

declare global {
  interface Window {
    markdownReader: MarkdownReaderApi
  }
}
