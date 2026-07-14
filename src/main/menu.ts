import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import { clearRecentPaths, getRecentPaths } from './recentFiles'

export type MenuActions = {
  openFile: () => Promise<void>
  openFolder: () => Promise<void>
  openFolderInNewWindow: () => Promise<void>
  openRecentPath: (filePath: string) => Promise<void>
}

function rebuild(actions: MenuActions): void {
  const recentPaths = getRecentPaths()

  const recentFileItems: MenuItemConstructorOptions[] =
    recentPaths.length > 0
      ? recentPaths.map((filePath) => ({
          label: path.basename(filePath),
          sublabel: filePath,
          click: () => actions.openRecentPath(filePath)
        }))
      : [{ label: 'No Recent Items', enabled: false }]

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File',
          accelerator: 'Command+O',
          click: () => actions.openFile()
        },
        {
          label: 'Open Folder',
          accelerator: 'Shift+Command+O',
          click: () => actions.openFolder()
        },
        {
          label: 'Open Folder in New Window',
          accelerator: 'Shift+Command+N',
          click: () => actions.openFolderInNewWindow()
        },
        {
          label: 'Open Recent',
          submenu: [
            ...recentFileItems,
            { type: 'separator' },
            {
              label: 'Clear Recent Items',
              enabled: recentPaths.length > 0,
              click: () => {
                clearRecentPaths()
                rebuild(actions)
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Close Window',
          accelerator: 'Command+W',
          click: () => BrowserWindow.getFocusedWindow()?.close()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function buildAppMenu(actions: MenuActions): void {
  rebuild(actions)
}
