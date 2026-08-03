import { realpathSync } from 'node:fs'
import path from 'node:path'

export function documentPathKey(filePath: string): string {
  const resolvedPath = path.resolve(filePath)

  try {
    return realpathSync.native(resolvedPath)
  } catch {
    // 路径可能在文件选择完成后被移动；仍返回稳定的绝对路径供错误处理和状态清理使用。
    return resolvedPath
  }
}

export class DocumentWindowRegistry<Window> {
  private readonly pathsByWindow = new Map<Window, string>()
  private readonly windowsByPath = new Map<string, Window>()

  get(filePath: string): Window | undefined {
    return this.windowsByPath.get(documentPathKey(filePath))
  }

  set(window: Window, filePath: string): void {
    this.delete(window)

    const pathKey = documentPathKey(filePath)
    const previousWindow = this.windowsByPath.get(pathKey)

    if (previousWindow !== undefined && previousWindow !== window) {
      this.pathsByWindow.delete(previousWindow)
    }

    this.pathsByWindow.set(window, pathKey)
    this.windowsByPath.set(pathKey, window)
  }

  delete(window: Window): void {
    const pathKey = this.pathsByWindow.get(window)

    if (!pathKey) {
      return
    }

    if (this.windowsByPath.get(pathKey) === window) {
      this.windowsByPath.delete(pathKey)
    }

    this.pathsByWindow.delete(window)
  }
}
