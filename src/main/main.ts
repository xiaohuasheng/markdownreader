import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildAppMenu } from './menu'
import { shouldCreateWindowForOpen } from './openBehavior'
import { addRecentPath, clearRecentPaths as clearStoredRecentPaths, getRecentPaths } from './recentFiles'
import { getOpenBehavior } from './settings'
import {
  isDirectoryPath,
  isSupportedDocumentPath,
  pickDocumentFile,
  pickMarkdownFolder,
  pickMarkdownSavePath,
  readDocumentFile,
  readMarkdownFolder,
  saveMarkdownFile
} from './file'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mdr-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true
    }
  }
])

type FolderWatchState = {
  folderPath: string
  watcher: FSWatcher
  refreshTimer: NodeJS.Timeout | null
}

type DocumentWatchState = {
  filePath: string
  watcher: FSWatcher
  refreshTimer: NodeJS.Timeout | null
  lastKnownContent: string
  pendingWriteContent: string | null
}

type RecentItem = {
  path: string
  name: string
  kind: 'file' | 'folder'
}

const windows = new Set<BrowserWindow>()
const pendingOpenPaths: string[] = []
const folderWatches = new Map<BrowserWindow, FolderWatchState>()
const documentWatches = new Map<BrowserWindow, DocumentWatchState>()
const presentationWindows = new Set<BrowserWindow>()
const occupiedWindows = new Set<BrowserWindow>()

function rebuildMenu(): void {
  buildAppMenu({
    newFile: () => createNewMarkdownFile(),
    openFile: () => openMarkdownFile(),
    openFolder: () => openMarkdownFolder(),
    openFolderInNewWindow: () => openMarkdownFolderInNewWindow(),
    openRecentPath: (recentPath) => openMarkdownPath(recentPath),
    clearRecentPaths: clearRecentItems
  })
}

function getRecentItems(): RecentItem[] {
  return getRecentPaths().map((recentPath) => ({
    path: recentPath,
    name: basename(recentPath),
    kind: isDirectoryPath(recentPath) ? 'folder' : 'file'
  }))
}

function notifyRecentItemsChanged(): void {
  const recentItems = getRecentItems()

  for (const window of windows) {
    if (!window.isDestroyed()) {
      sendToRenderer(window, 'recent-items-updated', recentItems)
    }
  }
}

function recordRecentPath(recentPath: string): void {
  addRecentPath(recentPath)
  rebuildMenu()
  notifyRecentItemsChanged()
}

function clearRecentItems(): void {
  clearStoredRecentPaths()
  notifyRecentItemsChanged()
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1080,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: 'Markdown Reader',
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fbfaf8',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.on('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }

    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault()

      if (/^https?:\/\//i.test(url)) {
        shell.openExternal(url)
      }
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  windows.add(window)
  window.webContents.once('did-finish-load', () => {
    void flushPendingOpenPaths(window)
  })
  window.on('leave-full-screen', () => {
    // 用户可通过 Esc 或 macOS 系统控件退出全屏，需要同步恢复普通 Reader 布局。
    if (presentationWindows.delete(window)) {
      sendToRenderer(window, 'presentation-mode-changed', false)
    }
  })
  window.on('closed', () => {
    stopWatchingMarkdownFolder(window)
    stopWatchingDocument(window)
    presentationWindows.delete(window)
    occupiedWindows.delete(window)
    windows.delete(window)
  })

  return window
}

async function flushPendingOpenPaths(window: BrowserWindow): Promise<void> {
  const paths = pendingOpenPaths.splice(0)

  for (const filePath of paths) {
    await openMarkdownPath(filePath, window)
  }
}

function resolveTargetWindow(window?: BrowserWindow | null): BrowserWindow {
  return window && !window.isDestroyed() ? window : BrowserWindow.getFocusedWindow() ?? createWindow()
}

function resolveOpenTargetWindow(window?: BrowserWindow | null, forceNewWindow = false): BrowserWindow {
  const candidate = window && !window.isDestroyed() ? window : BrowserWindow.getFocusedWindow()
  const candidateHasContent = candidate ? occupiedWindows.has(candidate) : false

  if (shouldCreateWindowForOpen(getOpenBehavior(), candidateHasContent, forceNewWindow)) {
    return createWindow()
  }

  return candidate ?? createWindow()
}

function sendToRenderer(window: BrowserWindow, channel: string, payload: unknown): void {
  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', () => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, payload)
      }
    })
    return
  }

  window.webContents.send(channel, payload)
}

function setPresentationMode(window: BrowserWindow, enabled: boolean): boolean {
  if (window.isDestroyed()) {
    return false
  }

  if (enabled) {
    presentationWindows.add(window)
  } else {
    presentationWindows.delete(window)
  }

  if (window.isFullScreen() !== enabled) {
    window.setFullScreen(enabled)
  }

  sendToRenderer(window, 'presentation-mode-changed', enabled)
  return enabled
}

async function openMarkdownPath(
  filePath: string,
  targetWindow?: BrowserWindow | null,
  forceNewWindow = false
): Promise<void> {
  if (isDirectoryPath(filePath)) {
    await openMarkdownFolder(filePath, targetWindow, forceNewWindow)
    return
  }

  if (isSupportedDocumentPath(filePath)) {
    await openMarkdownFile(filePath, targetWindow, forceNewWindow)
  }
}

async function createNewMarkdownFile(targetWindow?: BrowserWindow | null): Promise<void> {
  const window = resolveTargetWindow(targetWindow)
  const defaultDirectory = folderWatches.get(window)?.folderPath ?? ''
  const file = {
    path: '',
    fileName: 'Untitled.md',
    directory: defaultDirectory,
    content: '',
    kind: 'markdown' as const,
    isNew: true
  }

  stopWatchingDocument(window)
  occupiedWindows.add(window)
  sendToRenderer(window, 'new-markdown-file-created', file)
  window.setTitle('Untitled.md - Markdown Reader')
}

async function openMarkdownFile(
  filePath?: string,
  targetWindow?: BrowserWindow | null,
  forceNewWindow = false
): Promise<void> {
  try {
    const selectedPath = filePath ?? (await pickDocumentFile())
    if (!selectedPath) {
      return
    }

    const file = await readDocumentFile(selectedPath)
    const window = resolveOpenTargetWindow(targetWindow, forceNewWindow)

    stopWatchingMarkdownFolder(window)
    watchDocument(window, file.path, file.content)
    occupiedWindows.add(window)
    sendToRenderer(window, 'markdown-file-opened', file)
    window.setTitle(`${file.fileName} - Markdown Reader`)
    recordRecentPath(file.path)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The file could not be opened.'
    dialog.showErrorBox('Unable to Open Markdown File', message)
  }
}

async function openMarkdownFolder(
  folderPath?: string,
  targetWindow?: BrowserWindow | null,
  forceNewWindow = false
): Promise<void> {
  try {
    const selectedPath = folderPath ?? (await pickMarkdownFolder())
    if (!selectedPath) {
      return
    }

    const folder = await readMarkdownFolder(selectedPath)
    const window = resolveOpenTargetWindow(targetWindow, forceNewWindow)

    stopWatchingDocument(window)
    watchMarkdownFolder(window, folder.path)
    occupiedWindows.add(window)
    sendToRenderer(window, 'markdown-folder-opened', folder)
    window.setTitle(`${folder.name} - Markdown Reader`)
    recordRecentPath(folder.path)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The folder could not be opened.'
    dialog.showErrorBox('Unable to Open Markdown Folder', message)
  }
}

async function openMarkdownFolderInNewWindow(): Promise<void> {
  try {
    const selectedPath = await pickMarkdownFolder()
    if (!selectedPath) {
      return
    }

    await openMarkdownFolder(selectedPath, undefined, true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The folder could not be opened.'
    dialog.showErrorBox('Unable to Open Markdown Folder', message)
  }
}

function watchMarkdownFolder(window: BrowserWindow, folderPath: string): void {
  stopWatchingMarkdownFolder(window)

  try {
    // macOS 构建支持递归监听；重新扫描可正确反映根目录下任意层级的新增、删除和重命名。
    const watcher = watch(folderPath, { recursive: true }, () => {
      scheduleMarkdownFolderRefresh(window, folderPath)
    })
    folderWatches.set(window, { folderPath, watcher, refreshTimer: null })
    watcher.on('error', (error) => {
      console.error(`Unable to watch Markdown folder ${folderPath}:`, error)
    })
  } catch (error) {
    // 即使操作系统无法监听目录，打开文件夹本身仍可正常完成。
    console.error(`Unable to watch Markdown folder ${folderPath}:`, error)
  }
}

function stopWatchingMarkdownFolder(window: BrowserWindow): void {
  const state = folderWatches.get(window)
  if (!state) {
    return
  }
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer)
  }
  state.watcher.close()
  folderWatches.delete(window)
}

function scheduleMarkdownFolderRefresh(window: BrowserWindow, folderPath: string): void {
  const state = folderWatches.get(window)
  if (!state || state.folderPath !== folderPath) {
    return
  }
  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer)
  }

  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null
    void refreshMarkdownFolder(window, folderPath)
  }, 200)
}

async function refreshMarkdownFolder(window: BrowserWindow, folderPath: string): Promise<void> {
  try {
    const folder = await readMarkdownFolder(folderPath)
    if (folderWatches.get(window)?.folderPath === folderPath && !window.isDestroyed()) {
      sendToRenderer(window, 'markdown-folder-updated', folder)
    }
  } catch (error) {
    // 文件夹可能在文件事件和扫描之间被移动或删除。
    console.error(`Unable to refresh Markdown folder ${folderPath}:`, error)
  }
}

function watchDocument(window: BrowserWindow, filePath: string, initialContent: string): void {
  stopWatchingDocument(window)

  try {
    // 监听父目录而不是文件 inode，兼容编辑器通过“临时文件 + 重命名”替换原文件的保存方式。
    const watchedFileName = basename(filePath)
    const watcher = watch(dirname(filePath), (_eventType, changedFileName) => {
      if (changedFileName === null || changedFileName.toString() === watchedFileName) {
        scheduleDocumentRefresh(window, filePath)
      }
    })

    documentWatches.set(window, {
      filePath,
      watcher,
      refreshTimer: null,
      lastKnownContent: initialContent,
      pendingWriteContent: null
    })
    watcher.on('error', (error) => {
      console.error(`Unable to watch document ${filePath}:`, error)
    })
  } catch (error) {
    // 监听失败不影响文件打开和手动保存。
    console.error(`Unable to watch document ${filePath}:`, error)
  }
}

function stopWatchingDocument(window: BrowserWindow): void {
  const state = documentWatches.get(window)
  if (!state) {
    return
  }

  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer)
  }
  state.watcher.close()
  documentWatches.delete(window)
}

function scheduleDocumentRefresh(window: BrowserWindow, filePath: string): void {
  const state = documentWatches.get(window)
  if (!state || state.filePath !== filePath) {
    return
  }

  if (state.refreshTimer) {
    clearTimeout(state.refreshTimer)
  }

  state.refreshTimer = setTimeout(() => {
    state.refreshTimer = null
    void refreshDocument(window, filePath)
  }, 200)
}

async function refreshDocument(window: BrowserWindow, filePath: string): Promise<void> {
  try {
    const file = await readDocumentFile(filePath)
    const state = documentWatches.get(window)

    if (!state || state.filePath !== filePath || window.isDestroyed()) {
      return
    }

    if (file.content === state.lastKnownContent || file.content === state.pendingWriteContent) {
      state.lastKnownContent = file.content
      return
    }

    state.lastKnownContent = file.content
    sendToRenderer(window, 'markdown-file-updated', file)
  } catch (error) {
    // 文件可能在变更事件与读取之间被移动、删除或正处于替换过程。
    console.error(`Unable to refresh document ${filePath}:`, error)
  }
}

function getInitialMarkdownPaths(): string[] {
  return process.argv.filter((argument) => isSupportedDocumentPath(argument) || isDirectoryPath(argument))
}

function registerLocalFileProtocol(): void {
  protocol.handle('mdr-file', async (request) => {
    const url = new URL(request.url)
    const encodedPath = url.pathname.replace(/^\//, '')
    const filePath = decodeURIComponent(encodedPath)

    return net.fetch(pathToFileURL(filePath).toString())
  })
}

app.whenReady().then(() => {
  registerLocalFileProtocol()
  pendingOpenPaths.push(...getInitialMarkdownPaths())

  ipcMain.handle('new-markdown-file', async (event) => {
    await createNewMarkdownFile(BrowserWindow.fromWebContents(event.sender))
  })

  ipcMain.handle('open-markdown-file', async (event) => {
    await openMarkdownFile(undefined, BrowserWindow.fromWebContents(event.sender))
  })

  ipcMain.handle('open-markdown-folder', async (event) => {
    await openMarkdownFolder(undefined, BrowserWindow.fromWebContents(event.sender))
  })

  ipcMain.handle('open-markdown-folder-in-new-window', async () => {
    await openMarkdownFolderInNewWindow()
  })

  ipcMain.handle('get-presentation-mode', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    return window ? presentationWindows.has(window) : false
  })

  ipcMain.handle('set-presentation-mode', (event, enabled: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender)

    if (!window || typeof enabled !== 'boolean') {
      return false
    }

    return setPresentationMode(window, enabled)
  })

  ipcMain.handle('get-recent-items', () => getRecentItems())

  ipcMain.handle('open-recent-item', async (event, recentPath: string) => {
    if (!getRecentPaths().includes(recentPath)) {
      return
    }

    await openMarkdownPath(recentPath, BrowserWindow.fromWebContents(event.sender))
  })

  ipcMain.handle('read-markdown-file', async (event, filePath: string) => {
    const file = await readDocumentFile(filePath)
    const window = BrowserWindow.fromWebContents(event.sender)

    if (window) {
      watchDocument(window, file.path, file.content)
    }
    recordRecentPath(file.path)

    return file
  })

  ipcMain.handle('save-markdown-file', async (event, filePath: string, content: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const watchState = window ? documentWatches.get(window) : undefined

    if (watchState?.filePath === filePath) {
      watchState.pendingWriteContent = content
    }

    try {
      const file = await saveMarkdownFile(filePath, content)

      if (watchState?.filePath === filePath) {
        watchState.lastKnownContent = file.content
        watchState.pendingWriteContent = null
      }
      window?.setTitle(`${file.fileName} - Markdown Reader`)

      return file
    } catch (error) {
      if (watchState?.filePath === filePath) {
        watchState.pendingWriteContent = null
      }
      throw error
    }
  })

  ipcMain.handle('save-new-markdown-file', async (event, content: string, defaultDirectory?: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const safeDefaultDirectory = defaultDirectory && isDirectoryPath(defaultDirectory) ? defaultDirectory : undefined
    const selectedPath = await pickMarkdownSavePath(safeDefaultDirectory)

    if (!selectedPath) {
      return null
    }

    const file = await saveMarkdownFile(selectedPath, content)

    if (window) {
      watchDocument(window, file.path, file.content)
      window.setTitle(`${file.fileName} - Markdown Reader`)
    }
    recordRecentPath(file.path)

    return file
  })

  rebuildMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('open-file', (event, filePath) => {
  event.preventDefault()

  if (!isSupportedDocumentPath(filePath) && !isDirectoryPath(filePath)) {
    return
  }

  // macOS 从 Finder、Open With 或 Dock 拖入应用时会触发该事件。
  if (app.isReady()) {
    const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? createWindow()
    void openMarkdownPath(filePath, targetWindow)
  } else {
    pendingOpenPaths.push(filePath)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  for (const window of windows) {
    stopWatchingMarkdownFolder(window)
    stopWatchingDocument(window)
  }
})
