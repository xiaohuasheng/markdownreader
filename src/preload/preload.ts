import { contextBridge, ipcRenderer } from 'electron'

export type DocumentKind = 'markdown' | 'html'

export type MarkdownFile = {
  path: string
  fileName: string
  directory: string
  content: string
  kind: DocumentKind
  isNew?: boolean
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
  newFile: () => Promise<void>
  openFile: () => Promise<void>
  openFolder: () => Promise<void>
  openFolderInNewWindow: () => Promise<void>
  getPresentationMode: () => Promise<boolean>
  setPresentationMode: (enabled: boolean) => Promise<boolean>
  getRecentItems: () => Promise<RecentItem[]>
  openRecentItem: (recentPath: string) => Promise<void>
  readFile: (filePath: string) => Promise<MarkdownFile | null>
  saveFile: (filePath: string, content: string) => Promise<MarkdownFile>
  saveNewFile: (content: string, defaultDirectory?: string) => Promise<MarkdownFile | null>
  onRecentItemsUpdated: (callback: (recentItems: RecentItem[]) => void) => () => void
  onFileOpened: (callback: (file: MarkdownFile) => void) => () => void
  onNewFile: (callback: (file: MarkdownFile) => void) => () => void
  onFileUpdated: (callback: (file: MarkdownFile) => void) => () => void
  onFolderOpened: (callback: (folder: MarkdownFolder) => void) => () => void
  onFolderUpdated: (callback: (folder: MarkdownFolder) => void) => () => void
  onPresentationModeChanged: (callback: (enabled: boolean) => void) => () => void
}

const api: MarkdownReaderApi = {
  newFile: () => ipcRenderer.invoke('new-markdown-file'),
  openFile: () => ipcRenderer.invoke('open-markdown-file'),
  openFolder: () => ipcRenderer.invoke('open-markdown-folder'),
  openFolderInNewWindow: () => ipcRenderer.invoke('open-markdown-folder-in-new-window'),
  getPresentationMode: () => ipcRenderer.invoke('get-presentation-mode'),
  setPresentationMode: (enabled) => ipcRenderer.invoke('set-presentation-mode', enabled),
  getRecentItems: () => ipcRenderer.invoke('get-recent-items'),
  openRecentItem: (recentPath) => ipcRenderer.invoke('open-recent-item', recentPath),
  readFile: (filePath) => ipcRenderer.invoke('read-markdown-file', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-markdown-file', filePath, content),
  saveNewFile: (content, defaultDirectory) => ipcRenderer.invoke('save-new-markdown-file', content, defaultDirectory),
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
  onNewFile: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, file: MarkdownFile): void => callback(file)
    ipcRenderer.on('new-markdown-file-created', listener)

    return () => {
      ipcRenderer.removeListener('new-markdown-file-created', listener)
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
  },
  onPresentationModeChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, enabled: boolean): void => callback(enabled)
    ipcRenderer.on('presentation-mode-changed', listener)

    return () => {
      ipcRenderer.removeListener('presentation-mode-changed', listener)
    }
  }
}

contextBridge.exposeInMainWorld('markdownReader', api)
