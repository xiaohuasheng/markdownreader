import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseOpenBehavior, type OpenBehavior } from './openBehavior'

type PersistedSettings = {
  openBehavior?: unknown
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readSettings(): PersistedSettings {
  try {
    const value: unknown = JSON.parse(readFileSync(settingsPath(), 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as PersistedSettings) : {}
  } catch {
    return {}
  }
}

export function getOpenBehavior(): OpenBehavior {
  return parseOpenBehavior(readSettings().openBehavior)
}

export function setOpenBehavior(openBehavior: OpenBehavior): void {
  writeFileSync(settingsPath(), JSON.stringify({ ...readSettings(), openBehavior }, null, 2), 'utf8')
}
