import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import mermaid from 'mermaid'
import { renderHtml, renderMarkdown } from './markdown'
import type { MarkdownFile, MarkdownFileTreeNode, MarkdownFolder } from '../preload/preload'

type ViewMode = 'edit' | 'preview'
type DocumentOutlineItem = {
  id: string
  level: number
  text: string
}

const searchMatchSelector = 'mark[data-document-search-match]'
const outlineHeadingSelector = 'h1, h2, h3, h4, h5, h6'

function clearSearchHighlights(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(searchMatchSelector).forEach((match) => {
    const parent = match.parentNode

    if (!parent) {
      return
    }

    parent.replaceChild(document.createTextNode(match.textContent ?? ''), match)
    parent.normalize()
  })
}

function highlightSearchMatches(root: HTMLElement, query: string): HTMLElement[] {
  clearSearchHighlights(root)

  if (!query) {
    return []
  }

  const textNodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    }
  })

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  const normalizedQuery = query.toLocaleLowerCase()
  const matches: HTMLElement[] = []

  textNodes.forEach((textNode) => {
    const source = textNode.textContent ?? ''
    const normalizedSource = source.toLocaleLowerCase()
    let matchStart = normalizedSource.indexOf(normalizedQuery)

    if (matchStart === -1) {
      return
    }

    const fragment = document.createDocumentFragment()
    let cursor = 0

    while (matchStart !== -1) {
      if (matchStart > cursor) {
        fragment.append(source.slice(cursor, matchStart))
      }

      const match = document.createElement('mark')
      match.dataset.documentSearchMatch = 'true'
      match.textContent = source.slice(matchStart, matchStart + query.length)
      fragment.append(match)
      matches.push(match)

      cursor = matchStart + query.length
      matchStart = normalizedSource.indexOf(normalizedQuery, cursor)
    }

    if (cursor < source.length) {
      fragment.append(source.slice(cursor))
    }

    textNode.parentNode?.replaceChild(fragment, textNode)
  })

  return matches
}

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
  const readerRef = useRef<HTMLElement>(null)
  const stickyToolsRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [outlineItems, setOutlineItems] = useState<DocumentOutlineItem[]>([])
  const [activeOutlineId, setActiveOutlineId] = useState('')
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false)
  const html = useMemo(
    () => (isReadOnly ? renderHtml(file.content) : renderMarkdown(file.content, file.directory)),
    [file.content, file.directory, isReadOnly]
  )
  // 搜索状态变化会触发 Reader 重渲染。保持 innerHTML 属性对象稳定，避免 React
  // 用原始 HTML 覆盖运行时插入的搜索高亮节点，导致后续无法定位滚动目标。
  const renderedHtml = useMemo(() => ({ __html: html }), [html])
  const showsOutline = mode === 'preview' && outlineItems.length > 0
  const readerClassName = [
    'reader',
    isEmbedded ? 'reader--embedded' : '',
    showsOutline ? 'reader--with-outline' : ''
  ]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    const reader = readerRef.current
    const stickyTools = stickyToolsRef.current

    if (!reader || !stickyTools) {
      return
    }

    const updateStickyToolsHeight = (): void => {
      reader.style.setProperty('--reader-sticky-tools-height', `${Math.ceil(stickyTools.offsetHeight)}px`)
    }

    updateStickyToolsHeight()
    const resizeObserver = new ResizeObserver(updateStickyToolsHeight)
    resizeObserver.observe(stickyTools)

    return () => {
      resizeObserver.disconnect()
      reader.style.removeProperty('--reader-sticky-tools-height')
    }
  }, [])

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

  useEffect(() => {
    const preview = previewRef.current

    if (!preview || mode !== 'preview') {
      return
    }

    const matches = highlightSearchMatches(preview, searchQuery.trim())
    setSearchMatchCount(matches.length)
    setActiveSearchIndex((currentIndex) => (matches.length > 0 ? Math.min(currentIndex, matches.length - 1) : 0))

    return () => clearSearchHighlights(preview)
  }, [html, mode, searchQuery])

  useEffect(() => {
    const preview = previewRef.current

    if (!preview || mode !== 'preview') {
      setOutlineItems([])
      setActiveOutlineId('')
      return
    }

    const headings = Array.from(preview.querySelectorAll<HTMLHeadingElement>(outlineHeadingSelector))
    const items = headings.flatMap<DocumentOutlineItem>((heading, index) => {
      const text = heading.textContent?.trim() ?? ''

      if (!text) {
        return []
      }

      const id = `document-outline-heading-${index}`
      heading.id = id
      heading.dataset.documentOutlineHeading = 'true'

      return [{ id, level: Number(heading.tagName.slice(1)), text }]
    })

    setOutlineItems(items)
    setActiveOutlineId((currentId) => (items.some((item) => item.id === currentId) ? currentId : (items[0]?.id ?? '')))

    return () => {
      headings.forEach((heading) => {
        if (heading.dataset.documentOutlineHeading === 'true') {
          heading.removeAttribute('id')
          delete heading.dataset.documentOutlineHeading
        }
      })
    }
  }, [html, mode])

  useEffect(() => {
    if (!showsOutline) {
      return
    }

    let animationFrame = 0

    const updateActiveOutline = (): void => {
      animationFrame = 0
      const stickyBottom = stickyToolsRef.current?.getBoundingClientRect().bottom ?? 0
      let currentId = outlineItems[0]?.id ?? ''

      for (const item of outlineItems) {
        const heading = document.getElementById(item.id)

        if (!heading || heading.getBoundingClientRect().top > stickyBottom + 28) {
          break
        }

        currentId = item.id
      }

      setActiveOutlineId((previousId) => (previousId === currentId ? previousId : currentId))
    }

    const scheduleActiveOutlineUpdate = (): void => {
      if (!animationFrame) {
        animationFrame = window.requestAnimationFrame(updateActiveOutline)
      }
    }

    updateActiveOutline()
    window.addEventListener('scroll', scheduleActiveOutlineUpdate, { passive: true })
    window.addEventListener('resize', scheduleActiveOutlineUpdate)

    return () => {
      window.removeEventListener('scroll', scheduleActiveOutlineUpdate)
      window.removeEventListener('resize', scheduleActiveOutlineUpdate)

      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame)
      }
    }
  }, [outlineItems, showsOutline])

  useEffect(() => {
    const preview = previewRef.current

    if (!preview || searchMatchCount === 0) {
      return
    }

    const matches = Array.from(preview.querySelectorAll<HTMLElement>(searchMatchSelector))
    const activeMatch = matches[activeSearchIndex]

    matches.forEach((match, index) => match.classList.toggle('is-active', index === activeSearchIndex))
    activeMatch?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeSearchIndex, searchMatchCount])

  useEffect(() => {
    setIsSearchOpen(false)
    setSearchQuery('')
    setSearchMatchCount(0)
    setActiveSearchIndex(0)
  }, [file.path])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        onModeChange('preview')
        setIsSearchOpen(true)
        requestAnimationFrame(() => searchInputRef.current?.focus())
      }

      if (event.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false)
        setSearchQuery('')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isSearchOpen, onModeChange])

  function openSearch(): void {
    onModeChange('preview')
    setIsSearchOpen(true)
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  function moveSearchMatch(direction: 1 | -1): void {
    if (searchMatchCount === 0) {
      return
    }

    setActiveSearchIndex((currentIndex) => (currentIndex + direction + searchMatchCount) % searchMatchCount)
  }

  function jumpToOutlineItem(item: DocumentOutlineItem): void {
    const heading = document.getElementById(item.id)

    if (!heading) {
      return
    }

    setActiveOutlineId(item.id)
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main ref={readerRef} className={readerClassName}>
      <div ref={stickyToolsRef} className="reader__sticky-tools">
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
            <button className="secondary-button" type="button" onClick={openSearch}>
              Find
            </button>
            {!isReadOnly && (
              <button className="primary-button primary-button--compact" type="button" disabled={isSaving} onClick={onSave}>
                {isSaving ? 'Saving' : 'Save'}
              </button>
            )}
          </div>
        </header>
        {isSearchOpen && (
          <div className="document-search" role="search" aria-label="Search in document">
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              placeholder="Find in document"
              aria-label="Find in document"
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setActiveSearchIndex(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  moveSearchMatch(event.shiftKey ? -1 : 1)
                }
              }}
            />
            <span className="document-search__count" aria-live="polite">
              {searchQuery.trim() ? `${searchMatchCount === 0 ? 0 : activeSearchIndex + 1} / ${searchMatchCount}` : 'Type to search'}
            </span>
            <button type="button" aria-label="Previous match" disabled={searchMatchCount === 0} onClick={() => moveSearchMatch(-1)}>
              Previous
            </button>
            <button type="button" aria-label="Next match" disabled={searchMatchCount === 0} onClick={() => moveSearchMatch(1)}>
              Next
            </button>
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setIsSearchOpen(false)
                setSearchQuery('')
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
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
        <div
          className={`reader__document-layout${showsOutline ? ' reader__document-layout--with-outline' : ''}${
            showsOutline && isOutlineCollapsed ? ' reader__document-layout--outline-collapsed' : ''
          }`}
        >
          <article ref={previewRef} className="markdown-body" dangerouslySetInnerHTML={renderedHtml} />
          {showsOutline && (
            <aside className={`document-outline${isOutlineCollapsed ? ' document-outline--collapsed' : ''}`} aria-label="Document outline">
              <div className="document-outline__header">
                {!isOutlineCollapsed && <p>Outline</p>}
                <button
                  className="document-outline__toggle"
                  type="button"
                  aria-label={isOutlineCollapsed ? 'Expand document outline' : 'Collapse document outline'}
                  aria-expanded={!isOutlineCollapsed}
                  title={isOutlineCollapsed ? 'Expand outline' : 'Collapse outline'}
                  onClick={() => setIsOutlineCollapsed((collapsed) => !collapsed)}
                >
                  {isOutlineCollapsed ? '‹' : '›'}
                </button>
              </div>
              {!isOutlineCollapsed && (
                <nav aria-label="Document sections">
                  <ol className="document-outline__list">
                    {outlineItems.map((item) => (
                      <li key={item.id}>
                        <button
                          className={`document-outline__link document-outline__link--level-${item.level}${
                            activeOutlineId === item.id ? ' is-active' : ''
                          }`}
                          type="button"
                          title={item.text}
                          aria-current={activeOutlineId === item.id ? 'location' : undefined}
                          onClick={() => jumpToOutlineItem(item)}
                        >
                          {item.text}
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}
            </aside>
          )}
        </div>
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
