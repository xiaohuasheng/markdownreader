import { contextBridge, ipcRenderer } from 'electron'

export type DocumentKind = 'markdown' | 'html'

export type MarkdownFile = {
  path: string
  fileName: string
  directory: string
  content: string
  kind: DocumentKind
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

export type MarkdownReaderApi = {
  openFile: () => Promise<void>
  openFolder: () => Promise<void>
  openFolderInNewWindow: () => Promise<void>
  readFile: (filePath: string) => Promise<MarkdownFile>
  saveFile: (filePath: string, content: string) => Promise<MarkdownFile>
  onFileOpened: (callback: (file: MarkdownFile) => void) => () => void
  onFolderOpened: (callback: (folder: MarkdownFolder) => void) => () => void
  onFolderUpdated: (callback: (folder: MarkdownFolder) => void) => () => void
}

const api: MarkdownReaderApi = {
  openFile: () => ipcRenderer.invoke('open-markdown-file'),
  openFolder: () => ipcRenderer.invoke('open-markdown-folder'),
  openFolderInNewWindow: () => ipcRenderer.invoke('open-markdown-folder-in-new-window'),
  readFile: (filePath) => ipcRenderer.invoke('read-markdown-file', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-markdown-file', filePath, content),
  onFileOpened: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, file: MarkdownFile): void => callback(file)
    ipcRenderer.on('markdown-file-opened', listener)

    return () => {
      ipcRenderer.removeListener('markdown-file-opened', listener)
    }
  },
  onFolderOpened: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, folder: MarkdownFolder): void => callback(folder)
    ipcRenderer.on('markdown-folder-opened', listener)

    return () => {
      ipcRenderer.removeListener('markdown-folder-opened', listener)
    }
  },
  onFolderUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, folder: MarkdownFolder): void => callback(folder)
    ipcRenderer.on('markdown-folder-updated', listener)

    return () => {
      ipcRenderer.removeListener('markdown-folder-updated', listener)
    }
  }
}

contextBridge.exposeInMainWorld('markdownReader', api)
