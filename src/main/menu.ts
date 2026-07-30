import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import path from 'node:path'
import { getRecentPaths } from './recentFiles'
import { getOpenBehavior, setOpenBehavior } from './settings'

export type MenuActions = {
  newFile: () => Promise<void>
  openFile: () => Promise<void>
  openFolder: () => Promise<void>
  openFolderInNewWindow: () => Promise<void>
  openRecentPath: (filePath: string) => Promise<void>
  clearRecentPaths: () => void
}

function rebuild(actions: MenuActions): void {
  const recentPaths = getRecentPaths()
  const openBehavior = getOpenBehavior()

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
          label: 'New Markdown File',
          accelerator: 'Command+N',
          click: () => actions.newFile()
        },
        { type: 'separator' },
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
          label: 'Open Behavior',
          submenu: [
            {
              label: 'In New Window',
              type: 'radio',
              checked: openBehavior === 'new-window',
              click: () => {
                setOpenBehavior('new-window')
                rebuild(actions)
              }
            },
            {
              label: 'Replace Current Window',
              type: 'radio',
              checked: openBehavior === 'replace-current',
              click: () => {
                setOpenBehavior('replace-current')
                rebuild(actions)
              }
            }
          ]
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
                actions.clearRecentPaths()
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
