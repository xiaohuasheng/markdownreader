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

export type RecentItem = {
  path: string
  name: string
  kind: 'file' | 'folder'
}

export type MarkdownReaderApi = {
  openFile: () => Promise<void>
  openFolder: () => Promise<void>
  openFolderInNewWindow: () => Promise<void>
  getRecentItems: () => Promise<RecentItem[]>
  openRecentItem: (recentPath: string) => Promise<void>
  readFile: (filePath: string) => Promise<MarkdownFile>
  saveFile: (filePath: string, content: string) => Promise<MarkdownFile>
  onRecentItemsUpdated: (callback: (recentItems: RecentItem[]) => void) => () => void
  onFileOpened: (callback: (file: MarkdownFile) => void) => () => void
  onFileUpdated: (callback: (file: MarkdownFile) => void) => () => void
  onFolderOpened: (callback: (folder: MarkdownFolder) => void) => () => void
  onFolderUpdated: (callback: (folder: MarkdownFolder) => void) => () => void
}

const api: MarkdownReaderApi = {
  openFile: () => ipcRenderer.invoke('open-markdown-file'),
  openFolder: () => ipcRenderer.invoke('open-markdown-folder'),
  openFolderInNewWindow: () => ipcRenderer.invoke('open-markdown-folder-in-new-window'),
  getRecentItems: () => ipcRenderer.invoke('get-recent-items'),
  openRecentItem: (recentPath) => ipcRenderer.invoke('open-recent-item', recentPath),
  readFile: (filePath) => ipcRenderer.invoke('read-markdown-file', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-markdown-file', filePath, content),
  onRecentItemsUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, recentItems: RecentItem[]): void => callback(recentItems)
    ipcRenderer.on('recent-items-updated', listener)

    return () => {
      ipcRenderer.removeListener('recent-items-updated', listener)
    }
  },
  onFileOpened: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, file: MarkdownFile): void => callback(file)
    ipcRenderer.on('markdown-file-opened', listener)

    return () => {
      ipcRenderer.removeListener('markdown-file-opened', listener)
    }
  },
  onFileUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, file: MarkdownFile): void => callback(file)
    ipcRenderer.on('markdown-file-updated', listener)

    return () => {
      ipcRenderer.removeListener('markdown-file-updated', listener)
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
