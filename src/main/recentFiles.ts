import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const MAX_RECENT_FILES = 8

function storePath(): string {
  return path.join(app.getPath('userData'), 'recent-files.json')
}

export function getRecentFiles(): string[] {
  try {
    const raw = readFileSync(storePath(), 'utf8')
    const value: unknown = JSON.parse(raw)

    if (!Array.isArray(value)) {
      return []
    }

    return value.filter((item): item is string => typeof item === 'string' && existsSync(item)).slice(0, MAX_RECENT_FILES)
  } catch {
    return []
  }
}

export function addRecentFile(filePath: string): string[] {
  const recentFiles = [filePath, ...getRecentFiles().filter((item) => item !== filePath)].slice(0, MAX_RECENT_FILES)
  writeFileSync(storePath(), JSON.stringify(recentFiles, null, 2), 'utf8')
  return recentFiles
}

export const getRecentPaths = getRecentFiles
export const addRecentPath = addRecentFile

export function clearRecentFiles(): void {
  writeFileSync(storePath(), JSON.stringify([], null, 2), 'utf8')
}

export const clearRecentPaths = clearRecentFiles
