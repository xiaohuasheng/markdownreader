import path from 'node:path'

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const DEFAULT_MARKDOWN_FILE_NAME = 'Untitled.md'

export function createDefaultMarkdownSavePath(directory?: string): string {
  return directory ? path.join(directory, DEFAULT_MARKDOWN_FILE_NAME) : DEFAULT_MARKDOWN_FILE_NAME
}

export function normalizeMarkdownSavePath(filePath: string): string {
  const extension = path.extname(filePath)

  if (!extension) {
    return `${filePath}.md`
  }

  if (!MARKDOWN_EXTENSIONS.has(extension.toLowerCase())) {
    throw new Error('Only .md and .markdown files can be saved.')
  }

  return filePath
}
