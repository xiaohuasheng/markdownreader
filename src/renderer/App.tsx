import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import mermaid from 'mermaid'
import { renderHtml, renderMarkdown } from './markdown'
import type { MarkdownFile, MarkdownFileTreeNode, MarkdownFolder } from '../preload/preload'

type ViewMode = 'edit' | 'preview'

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'neutral'
})

function Welcome(): ReactElement {
  return (
    <main className="welcome">
      <section className="welcome__content" aria-labelledby="welcome-title">
        <p className="welcome__eyebrow">Markdown Reader</p>
        <h1 id="welcome-title">Read local Markdown with a quiet Typora-like surface.</h1>
        <div className="welcome__actions">
          <button className="primary-button" type="button" onClick={() => window.markdownReader.openFolder()}>
            Open Folder
          </button>
          <button className="secondary-button" type="button" onClick={() => window.markdownReader.openFolderInNewWindow()}>
            Open Folder in New Window
          </button>
          <button className="secondary-button" type="button" onClick={() => window.markdownReader.openFile()}>
            Open File
          </button>
        </div>
      </section>
    </main>
  )
}

function FolderTree({
  nodes,
  activePath,
  onOpenFile
}: {
  nodes: MarkdownFileTreeNode[]
  activePath: string | null
  onOpenFile: (filePath: string) => void
}): ReactElement {
  return (
    <ul className="folder-tree">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.type === 'directory' ? (
            <details open>
              <summary>{node.name}</summary>
              <FolderTree nodes={node.children ?? []} activePath={activePath} onOpenFile={onOpenFile} />
            </details>
          ) : (
            <button
              className={node.path === activePath ? 'is-active' : ''}
              type="button"
              title={node.path}
              onClick={() => onOpenFile(node.path)}
            >
              {node.name}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function FolderSidebar({
  folder,
  activePath,
  onOpenFile
}: {
  folder: MarkdownFolder
  activePath: string | null
  onOpenFile: (filePath: string) => void
}): ReactElement {
  return (
    <aside className="folder-sidebar">
      <div className="folder-sidebar__header">
        <p>Folder</p>
        <h2>{folder.name}</h2>
      </div>
      {folder.files.length > 0 ? (
        <FolderTree nodes={folder.files} activePath={activePath} onOpenFile={onOpenFile} />
      ) : (
        <p className="folder-sidebar__empty">No Markdown files found.</p>
      )}
    </aside>
  )
}

function Reader({
  file,
  draft,
  mode,
  isSaving,
  message,
  onDraftChange,
  onModeChange,
  onSave,
  isEmbedded = false
}: {
  file: MarkdownFile
  draft: string
  mode: ViewMode
  isSaving: boolean
  message: string
  onDraftChange: (value: string) => void
  onModeChange: (mode: ViewMode) => void
  onSave: () => Promise<void>
  isEmbedded?: boolean
}): ReactElement {
  const isReadOnly = file.kind === 'html'
  const html = useMemo(
    () => (isReadOnly ? renderHtml(file.content) : renderMarkdown(file.content, file.directory)),
    [file.content, file.directory, isReadOnly]
  )

  useEffect(() => {
    if (mode !== 'preview') {
      return
    }

    // Mermaid mutates its placeholders into SVG after the sanitized Markdown
    // preview has been committed, matching the rest of the render pipeline.
    mermaid.run({ querySelector: '.markdown-body .mermaid' }).catch((error: unknown) => {
      console.error('Unable to render Mermaid diagram', error)
    })
  }, [html, mode])

  return (
    <main className={isEmbedded ? 'reader reader--embedded' : 'reader'}>
      <header className="reader__header">
        <div>
          <p className="reader__path">{file.path}</p>
          <h1>{file.fileName}</h1>
        </div>
        <div className="reader__actions">
          {!isReadOnly && (
            <div className="segmented-control" aria-label="View mode">
              <button
                className={mode === 'edit' ? 'is-active' : ''}
                type="button"
                onClick={() => onModeChange('edit')}
              >
                Edit
              </button>
              <button
                className={mode === 'preview' ? 'is-active' : ''}
                type="button"
                onClick={() => onModeChange('preview')}
              >
                Preview
              </button>
            </div>
          )}
          <button className="secondary-button" type="button" onClick={() => window.markdownReader.openFile()}>
            Open
          </button>
          <button className="secondary-button" type="button" onClick={() => window.markdownReader.openFolder()}>
            Folder
          </button>
          <button className="secondary-button" type="button" onClick={() => window.markdownReader.openFolderInNewWindow()}>
            New Folder Window
          </button>
          {!isReadOnly && (
            <button className="primary-button primary-button--compact" type="button" disabled={isSaving} onClick={onSave}>
              {isSaving ? 'Saving' : 'Save'}
            </button>
          )}
        </div>
      </header>
      {message && <p className="reader__message">{message}</p>}
      {!isReadOnly && mode === 'edit' ? (
        <textarea
          className="markdown-editor"
          aria-label="Markdown editor"
          value={draft}
          spellCheck={false}
          onChange={(event) => onDraftChange(event.target.value)}
        />
      ) : (
        <article className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </main>
  )
}

export default function App(): ReactElement {
  const [file, setFile] = useState<MarkdownFile | null>(null)
  const [folder, setFolder] = useState<MarkdownFolder | null>(null)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<ViewMode>('preview')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(
    () =>
      window.markdownReader.onFileOpened((openedFile) => {
        setFolder(null)
        setFile(openedFile)
        setDraft(openedFile.content)
        setMode('preview')
        setMessage('')
      }),
    []
  )

  useEffect(
    () =>
      window.markdownReader.onFolderOpened((openedFolder) => {
        setFolder(openedFolder)
        setFile(null)
        setDraft('')
        setMode('preview')
        setMessage(openedFolder.files.length > 0 ? 'Select a Markdown file from the folder.' : 'No Markdown files found.')
      }),
    []
  )

  useEffect(
    () =>
      window.markdownReader.onFolderUpdated((updatedFolder) => {
        setFolder(updatedFolder)
      }),
    []
  )

  async function openFolderFile(filePath: string): Promise<void> {
    setMessage('')

    try {
      const openedFile = await window.markdownReader.readFile(filePath)
      setFile(openedFile)
      setDraft(openedFile.content)
      setMode('preview')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to open this file.'
      setMessage(errorMessage)
    }
  }

  async function saveCurrentFile(): Promise<void> {
    if (!file || isSaving) {
      return
    }

    setIsSaving(true)
    setMessage('')

    try {
      // Save overwrites the opened file and returns a fresh read from disk, so
      // the preview always reflects the persisted content rather than stale UI.
      const savedFile = await window.markdownReader.saveFile(file.path, draft)
      setFile(savedFile)
      setDraft(savedFile.content)
      setMode('preview')
      setMessage('Saved')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to save this file.'
      setMessage(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  if (!file) {
    if (folder) {
      return (
        <>
          <div className="window-drag-region" aria-hidden="true" />
          <div className="workspace">
            <FolderSidebar folder={folder} activePath={null} onOpenFile={(filePath) => void openFolderFile(filePath)} />
            <main className="workspace__empty">
              <p>{message}</p>
            </main>
          </div>
        </>
      )
    }

    return (
      <>
        <div className="window-drag-region" aria-hidden="true" />
        <Welcome />
      </>
    )
  }

  if (folder) {
    return (
      <>
        <div className="window-drag-region" aria-hidden="true" />
        <div className="workspace">
          <FolderSidebar folder={folder} activePath={file.path} onOpenFile={(filePath) => void openFolderFile(filePath)} />
          <Reader
            file={file}
            draft={draft}
            mode={mode}
            isSaving={isSaving}
            message={message}
            onDraftChange={setDraft}
            onModeChange={setMode}
            onSave={saveCurrentFile}
            isEmbedded
          />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="window-drag-region" aria-hidden="true" />
      <Reader
        file={file}
        draft={draft}
        mode={mode}
        isSaving={isSaving}
        message={message}
        onDraftChange={setDraft}
        onModeChange={setMode}
        onSave={saveCurrentFile}
      />
    </>
  )
}
