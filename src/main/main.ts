import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildAppMenu } from './menu'
import { addRecentPath } from './recentFiles'
import {
  isDirectoryPath,
  isSupportedDocumentPath,
  pickDocumentFile,
  pickMarkdownFolder,
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

const windows = new Set<BrowserWindow>()
const pendingOpenPaths: string[] = []
const folderWatches = new Map<BrowserWindow, FolderWatchState>()

function rebuildMenu(): void {
  buildAppMenu({
    openFile: () => openMarkdownFile(),
    openFolder: () => openMarkdownFolder(),
    openFolderInNewWindow: () => openMarkdownFolderInNewWindow(),
    openRecentPath: (recentPath) => openMarkdownPath(recentPath)
  })
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
  window.on('closed', () => {
    stopWatchingMarkdownFolder(window)
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

async function openMarkdownPath(filePath: string, targetWindow?: BrowserWindow | null): Promise<void> {
  if (isDirectoryPath(filePath)) {
    await openMarkdownFolder(filePath, targetWindow)
    return
  }

  if (isSupportedDocumentPath(filePath)) {
    await openMarkdownFile(filePath, targetWindow)
  }
}

async function openMarkdownFile(filePath?: string, targetWindow?: BrowserWindow | null): Promise<void> {
  try {
    const selectedPath = filePath ?? (await pickDocumentFile())
    if (!selectedPath) {
      return
    }

    const file = await readDocumentFile(selectedPath)
    const window = resolveTargetWindow(targetWindow)

    stopWatchingMarkdownFolder(window)
    sendToRenderer(window, 'markdown-file-opened', file)
    window.setTitle(`${file.fileName} - Markdown Reader`)
    addRecentPath(file.path)
    rebuildMenu()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The file could not be opened.'
    dialog.showErrorBox('Unable to Open Markdown File', message)
  }
}

async function openMarkdownFolder(folderPath?: string, targetWindow?: BrowserWindow | null): Promise<void> {
  try {
    const selectedPath = folderPath ?? (await pickMarkdownFolder())
    if (!selectedPath) {
      return
    }

    const folder = await readMarkdownFolder(selectedPath)
    const window = resolveTargetWindow(targetWindow)

    watchMarkdownFolder(window, folder.path)
    sendToRenderer(window, 'markdown-folder-opened', folder)
    window.setTitle(`${folder.name} - Markdown Reader`)
    addRecentPath(folder.path)
    rebuildMenu()
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

    const window = createWindow()
    await openMarkdownFolder(selectedPath, window)
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

  ipcMain.handle('open-markdown-file', async (event) => {
    await openMarkdownFile(undefined, BrowserWindow.fromWebContents(event.sender))
  })

  ipcMain.handle('open-markdown-folder', async (event) => {
    await openMarkdownFolder(undefined, BrowserWindow.fromWebContents(event.sender))
  })

  ipcMain.handle('open-markdown-folder-in-new-window', async () => {
    await openMarkdownFolderInNewWindow()
  })

  ipcMain.handle('read-markdown-file', async (_event, filePath: string) => readDocumentFile(filePath))

  ipcMain.handle('save-markdown-file', async (event, filePath: string, content: string) => {
    const file = await saveMarkdownFile(filePath, content)
    BrowserWindow.fromWebContents(event.sender)?.setTitle(`${file.fileName} - Markdown Reader`)

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
  }
})
