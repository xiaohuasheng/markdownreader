import { dialog } from 'electron'
import { statSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type MarkdownFile = {
  path: string
  fileName: string
  directory: string
  content: string
}

export type MarkdownFileTreeNode = {
  type: 'file' | 'directory'
  path: string
  name: string
  children?: MarkdownFileTreeNode[]
}

export type MarkdownFolder = {
  path: string
  name: string
  files: MarkdownFileTreeNode[]
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])
const IGNORED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', '.DS_Store'])

export function isMarkdownPath(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

export function isDirectoryPath(filePath: string): boolean {
  try {
    return statSync(filePath).isDirectory()
  } catch {
    return false
  }
}

export async function pickMarkdownFile(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Open Markdown File',
    properties: ['openFile'],
    filters: [
      { name: 'Markdown Documents', extensions: ['md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

export async function pickMarkdownFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Open Markdown Folder',
    properties: ['openDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

export async function readMarkdownFile(filePath: string): Promise<MarkdownFile> {
  if (!isMarkdownPath(filePath)) {
    throw new Error('Only .md and .markdown files can be opened.')
  }

  const content = await readFile(filePath, 'utf8')
  return {
    path: filePath,
    fileName: path.basename(filePath),
    directory: path.dirname(filePath),
    content
  }
}

export async function saveMarkdownFile(filePath: string, content: string): Promise<MarkdownFile> {
  if (!isMarkdownPath(filePath)) {
    throw new Error('Only .md and .markdown files can be saved.')
  }

  await writeFile(filePath, content, 'utf8')
  return readMarkdownFile(filePath)
}

function compareTreeNodes(left: MarkdownFileTreeNode, right: MarkdownFileTreeNode): number {
  if (left.type !== right.type) {
    return left.type === 'directory' ? -1 : 1
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true })
}

async function scanMarkdownDirectory(directoryPath: string): Promise<MarkdownFileTreeNode[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const nodes: MarkdownFileTreeNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_DIRECTORY_NAMES.has(entry.name)) {
      continue
    }

    const entryPath = path.join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      const children = await scanMarkdownDirectory(entryPath)

      // Keep only directories that actually contain markdown files somewhere
      // below them, so the sidebar stays focused on readable content.
      if (children.length > 0) {
        nodes.push({
          type: 'directory',
          path: entryPath,
          name: entry.name,
          children
        })
      }

      continue
    }

    if (entry.isFile() && isMarkdownPath(entryPath)) {
      nodes.push({
        type: 'file',
        path: entryPath,
        name: entry.name
      })
    }
  }

  return nodes.sort(compareTreeNodes)
}

export async function readMarkdownFolder(folderPath: string): Promise<MarkdownFolder> {
  const files = await scanMarkdownDirectory(folderPath)

  return {
    path: folderPath,
    name: path.basename(folderPath),
    files
  }
}
