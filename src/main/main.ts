import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildAppMenu } from './menu'
import { addRecentPath } from './recentFiles'
import {
  isDirectoryPath,
  isMarkdownPath,
  pickMarkdownFile,
  pickMarkdownFolder,
  readMarkdownFile,
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

let mainWindow: BrowserWindow | null = null
let pendingOpenPaths: string[] = []

function rebuildMenu(): void {
  buildAppMenu({
    openFile: () => openMarkdownFile(),
    openFolder: () => openMarkdownFolder(),
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

  mainWindow = window
  window.webContents.once('did-finish-load', () => {
    void flushPendingOpenPaths()
  })

  return window
}

async function flushPendingOpenPaths(): Promise<void> {
  const paths = pendingOpenPaths
  pendingOpenPaths = []

  for (const filePath of paths) {
    await openMarkdownPath(filePath)
  }
}

async function openMarkdownPath(filePath: string): Promise<void> {
  if (isDirectoryPath(filePath)) {
    await openMarkdownFolder(filePath)
    return
  }

  if (isMarkdownPath(filePath)) {
    await openMarkdownFile(filePath)
  }
}

async function openMarkdownFile(filePath?: string): Promise<void> {
  try {
    const selectedPath = filePath ?? (await pickMarkdownFile())
    if (!selectedPath) {
      return
    }

    const file = await readMarkdownFile(selectedPath)
    const window = mainWindow ?? createWindow()

    window.webContents.send('markdown-file-opened', file)
    window.setTitle(`${file.fileName} - Markdown Reader`)
    addRecentPath(file.path)
    rebuildMenu()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The file could not be opened.'
    dialog.showErrorBox('Unable to Open Markdown File', message)
  }
}

async function openMarkdownFolder(folderPath?: string): Promise<void> {
  try {
    const selectedPath = folderPath ?? (await pickMarkdownFolder())
    if (!selectedPath) {
      return
    }

    const folder = await readMarkdownFolder(selectedPath)
    const window = mainWindow ?? createWindow()

    window.webContents.send('markdown-folder-opened', folder)
    window.setTitle(`${folder.name} - Markdown Reader`)
    addRecentPath(folder.path)
    rebuildMenu()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The folder could not be opened.'
    dialog.showErrorBox('Unable to Open Markdown Folder', message)
  }
}

function getInitialMarkdownPaths(): string[] {
  return process.argv.filter((argument) => isMarkdownPath(argument) || isDirectoryPath(argument))
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
  pendingOpenPaths = getInitialMarkdownPaths()

  ipcMain.handle('open-markdown-file', async () => {
    await openMarkdownFile()
  })

  ipcMain.handle('open-markdown-folder', async () => {
    await openMarkdownFolder()
  })

  ipcMain.handle('read-markdown-file', async (_event, filePath: string) => readMarkdownFile(filePath))

  ipcMain.handle('save-markdown-file', async (_event, filePath: string, content: string) => {
    const file = await saveMarkdownFile(filePath, content)
    mainWindow?.setTitle(`${file.fileName} - Markdown Reader`)

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

  if (!isMarkdownPath(filePath) && !isDirectoryPath(filePath)) {
    return
  }

  // macOS sends this when Finder/Open With or a Dock icon drop targets the app.
  // Queue it until the renderer is loaded so launched documents are not lost.
  if (app.isReady() && mainWindow) {
    void openMarkdownPath(filePath)
  } else {
    pendingOpenPaths.push(filePath)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
