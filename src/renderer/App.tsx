import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import mermaid from 'mermaid'
import { MermaidDiagramViewer } from './MermaidDiagramViewer'
import type { MermaidDiagramSnapshot } from './MermaidDiagramViewer'
import { getDocumentPreviewContent } from './documentPreview'
import {
  calculateEditorMatchScrollTop,
  findEditorSearchMatches,
  getEditorSearchMatchLineNumber
} from './editorSearch'
import { renderHtml, renderMarkdown } from './markdown'
import {
  changePresentationFontSize,
  DEFAULT_PRESENTATION_FONT_SIZE,
  MAX_PRESENTATION_FONT_SIZE,
  MIN_PRESENTATION_FONT_SIZE,
  PRESENTATION_TOOLBAR_IDLE_DELAY,
  shouldSchedulePresentationToolbarCollapse
} from './presentationSettings'
import { activateSearchInput } from './searchInput'
import { calculateScrollOffset, calculateScrollProgress } from './scrollPosition'
import type { MarkdownFile, MarkdownFileTreeNode, MarkdownFolder, RecentItem } from '../preload/preload'

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

function RecentItemGroup({
  title,
  items,
  emptyMessage
}: {
  title: string
  items: RecentItem[]
  emptyMessage: string
}): ReactElement {
  return (
    <section className="recent-group" aria-label={title}>
      <div className="recent-group__header">
        <h2>{title}</h2>
        <span>{items.length.toString().padStart(2, '0')}</span>
      </div>
      {items.length > 0 ? (
        <ol className="recent-list">
          {items.map((item) => (
            <li key={item.path}>
              <button
                className="recent-item"
                type="button"
                title={item.path}
                onClick={() => void window.markdownReader.openRecentItem(item.path)}
              >
                <span className={`recent-item__icon recent-item__icon--${item.kind}`} aria-hidden="true" />
                <span className="recent-item__copy">
                  <strong>{item.name}</strong>
                  <small>{item.path}</small>
                </span>
                <span className="recent-item__arrow" aria-hidden="true">
                  →
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="recent-group__empty">{emptyMessage}</p>
      )}
    </section>
  )
}

function Welcome(): ReactElement {
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])

  useEffect(() => {
    let isMounted = true

    void window.markdownReader.getRecentItems().then(
      (items) => {
        if (isMounted) {
          setRecentItems(items)
        }
      },
      () => {
        if (isMounted) {
          setRecentItems([])
        }
      }
    )

    const stopListening = window.markdownReader.onRecentItemsUpdated(setRecentItems)

    return () => {
      isMounted = false
      stopListening()
    }
  }, [])

  const recentFolders = recentItems.filter((item) => item.kind === 'folder')
  const recentFiles = recentItems.filter((item) => item.kind === 'file')

  return (
    <main className="welcome">
      <section className="welcome__content" aria-labelledby="welcome-title">
        <div className="welcome__hero">
          <div className="welcome__intro">
            <p className="welcome__eyebrow">Markdown Reader</p>
            <h1 id="welcome-title">
              Read local Markdown.
              <em>Pick up where you left off.</em>
            </h1>
            <p className="welcome__summary">A quiet, local-first space for reading and editing your notes.</p>
          </div>
          <div className="welcome__actions">
            <button className="primary-button" type="button" onClick={() => window.markdownReader.newFile()}>
              New File
            </button>
            <button className="primary-button" type="button" onClick={() => window.markdownReader.openFolder()}>
              Open Folder
            </button>
            <button className="secondary-button" type="button" onClick={() => window.markdownReader.openFolderInNewWindow()}>
              New Folder Window
            </button>
            <button className="secondary-button" type="button" onClick={() => window.markdownReader.openFile()}>
              Open File
            </button>
          </div>
        </div>

        <section className="welcome__recent" aria-labelledby="recent-title">
          <header className="welcome__recent-header">
            <div>
              <p>Continue reading</p>
              <h2 id="recent-title">Recent</h2>
            </div>
            <span>{recentItems.length} saved {recentItems.length === 1 ? 'place' : 'places'}</span>
          </header>
          <div className="welcome__recent-grid">
            <RecentItemGroup title="Folders" items={recentFolders} emptyMessage="Opened folders will appear here." />
            <RecentItemGroup title="Files" items={recentFiles} emptyMessage="Opened Markdown and HTML files will appear here." />
          </div>
        </section>
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
  hasExternalConflict,
  message,
  onDraftChange,
  onModeChange,
  onSave,
  isPresentation,
  onPresentationModeChange,
  isEmbedded = false
}: {
  file: MarkdownFile
  draft: string
  mode: ViewMode
  isSaving: boolean
  hasExternalConflict: boolean
  message: string
  onDraftChange: (value: string) => void
  onModeChange: (mode: ViewMode) => void
  onSave: () => Promise<boolean>
  isPresentation: boolean
  onPresentationModeChange: (enabled: boolean) => Promise<void>
  isEmbedded?: boolean
}): ReactElement {
  const isReadOnly = file.kind === 'html'
  const readerRef = useRef<HTMLElement>(null)
  const stickyToolsRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLElement>(null)
  const markdownEditorRef = useRef<HTMLTextAreaElement>(null)
  const editorHighlightMirrorRef = useRef<HTMLPreElement>(null)
  const editorHighlightMatchRef = useRef<HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const previousModeRef = useRef(mode)
  const previousFilePathRef = useRef(file.path)
  const modeScrollProgressRef = useRef<Record<ViewMode, number>>({ edit: 0, preview: 0 })
  const pendingModeScrollRef = useRef<{ mode: ViewMode; progress: number } | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  const [outlineItems, setOutlineItems] = useState<DocumentOutlineItem[]>([])
  const [activeOutlineId, setActiveOutlineId] = useState('')
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false)
  const [activeDiagram, setActiveDiagram] = useState<MermaidDiagramSnapshot | null>(null)
  const [presentationFontSize, setPresentationFontSize] = useState(DEFAULT_PRESENTATION_FONT_SIZE)
  const [isPresentationToolbarCollapsed, setIsPresentationToolbarCollapsed] = useState(false)
  const [presentationToolbarActivity, setPresentationToolbarActivity] = useState(0)
  const previewContent = getDocumentPreviewContent(file.kind, file.content, draft)
  const html = useMemo(
    () => (isReadOnly ? renderHtml(previewContent) : renderMarkdown(previewContent, file.directory)),
    [file.directory, isReadOnly, previewContent]
  )
  const editorSearchMatches = useMemo(
    () => findEditorSearchMatches(draft, searchQuery.trim()),
    [draft, searchQuery]
  )
  const activeEditorSearchMatch =
    mode === 'edit' && isSearchOpen ? editorSearchMatches[activeSearchIndex] : undefined
  const activeEditorSearchLineNumber = activeEditorSearchMatch
    ? getEditorSearchMatchLineNumber(draft, activeEditorSearchMatch.start)
    : null
  // 搜索状态变化会触发 Reader 重渲染。保持 innerHTML 属性对象稳定，避免 React
  // 用原始 HTML 覆盖运行时插入的搜索高亮节点，导致后续无法定位滚动目标。
  const renderedHtml = useMemo(() => ({ __html: html }), [html])
  const showsOutline = mode === 'preview' && outlineItems.length > 0
  const readerClassName = [
    'reader',
    isEmbedded ? 'reader--embedded' : '',
    showsOutline ? 'reader--with-outline' : '',
    isPresentation ? 'reader--presentation' : ''
  ]
    .filter(Boolean)
    .join(' ')
  const readerStyle = isPresentation
    ? ({ '--presentation-font-size': `${presentationFontSize}px` } as CSSProperties)
    : undefined

  const captureModeScrollProgress = useCallback(
    (sourceMode: ViewMode): number => {
      if (sourceMode === 'edit') {
        const editor = markdownEditorRef.current

        if (!editor) {
          return modeScrollProgressRef.current.edit
        }

        const progress = calculateScrollProgress(editor.scrollTop, editor.scrollHeight, editor.clientHeight)
        modeScrollProgressRef.current.edit = progress
        return progress
      }

      const preview = previewRef.current

      if (!preview) {
        return modeScrollProgressRef.current.preview
      }

      const previewTop = window.scrollY + preview.getBoundingClientRect().top
      const progress = calculateScrollProgress(window.scrollY - previewTop, preview.scrollHeight, window.innerHeight)
      modeScrollProgressRef.current.preview = progress
      return progress
    },
    []
  )

  const syncEditorHighlightScroll = useCallback((): void => {
    const editor = markdownEditorRef.current
    const mirror = editorHighlightMirrorRef.current

    if (editor && mirror) {
      mirror.style.transform = `translateY(-${editor.scrollTop}px)`
    }
  }, [])

  const prepareModeScrollRestore = useCallback(
    (nextMode: ViewMode): void => {
      if (nextMode === mode) {
        return
      }

      pendingModeScrollRef.current = {
        mode: nextMode,
        progress: captureModeScrollProgress(mode)
      }
    },
    [captureModeScrollProgress, mode]
  )

  const changeViewMode = useCallback(
    (nextMode: ViewMode): void => {
      if (nextMode === mode) {
        return
      }

      prepareModeScrollRestore(nextMode)
      onModeChange(nextMode)
    },
    [mode, onModeChange, prepareModeScrollRestore]
  )

  useLayoutEffect(() => {
    if (previousFilePathRef.current !== file.path) {
      previousFilePathRef.current = file.path
      previousModeRef.current = mode
      modeScrollProgressRef.current = { edit: 0, preview: 0 }
      pendingModeScrollRef.current = null
      return
    }

    const previousMode = previousModeRef.current
    const pendingScroll = pendingModeScrollRef.current

    if (previousMode === mode && pendingScroll?.mode !== mode) {
      return
    }

    const progress =
      pendingScroll?.mode === mode ? pendingScroll.progress : modeScrollProgressRef.current[previousMode]
    previousModeRef.current = mode

    const animationFrame = window.requestAnimationFrame(() => {
      if (mode === 'edit') {
        const editor = markdownEditorRef.current

        if (!editor) {
          return
        }

        editor.scrollTop = calculateScrollOffset(progress, editor.scrollHeight, editor.clientHeight)
        syncEditorHighlightScroll()
        const stickyToolsHeight = stickyToolsRef.current?.offsetHeight ?? 0
        const editorTop = window.scrollY + editor.getBoundingClientRect().top
        window.scrollTo({
          top: Math.max(0, editorTop - stickyToolsHeight - 16),
          behavior: 'auto'
        })
        modeScrollProgressRef.current.edit = progress
      } else {
        const preview = previewRef.current

        if (!preview) {
          return
        }

        const previewTop = window.scrollY + preview.getBoundingClientRect().top
        const previewOffset = calculateScrollOffset(progress, preview.scrollHeight, window.innerHeight)
        window.scrollTo({
          top: Math.max(0, previewTop + previewOffset),
          behavior: 'auto'
        })
        modeScrollProgressRef.current.preview = progress
      }

      pendingModeScrollRef.current = null
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [file.path, html, mode, syncEditorHighlightScroll])

  useEffect(() => {
    if (mode !== 'preview') {
      return
    }

    const updatePreviewScrollProgress = (): void => {
      captureModeScrollProgress('preview')
    }

    updatePreviewScrollProgress()
    window.addEventListener('scroll', updatePreviewScrollProgress, { passive: true })

    return () => window.removeEventListener('scroll', updatePreviewScrollProgress)
  }, [captureModeScrollProgress, html, mode])

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
    const preview = previewRef.current

    if (!preview || mode !== 'preview') {
      return
    }

    let isDisposed = false
    const diagrams = Array.from(preview.querySelectorAll<HTMLElement>('.mermaid'))

    function markRenderedDiagramsInteractive(): void {
      if (isDisposed) {
        return
      }

      diagrams.forEach((diagram, index) => {
        if (!diagram.querySelector('svg')) {
          return
        }

        diagram.dataset.diagramInteractive = 'true'
        diagram.tabIndex = 0
        diagram.setAttribute('role', 'button')
        diagram.setAttribute('aria-label', `Open Mermaid diagram ${index + 1}`)
        diagram.setAttribute('title', 'Click to enlarge; scroll to zoom and drag to move')
      })
    }

    // Mermaid 在已清理的 Markdown 提交到页面后生成 SVG，再补充查看器入口。
    void mermaid
      .run({ nodes: diagrams })
      .then(markRenderedDiagramsInteractive)
      .catch((error: unknown) => {
        console.error('Unable to render Mermaid diagram', error)
      })

    return () => {
      isDisposed = true
      diagrams.forEach((diagram) => {
        delete diagram.dataset.diagramInteractive
        diagram.removeAttribute('tabindex')
        diagram.removeAttribute('role')
        diagram.removeAttribute('aria-label')
        diagram.removeAttribute('title')
      })
    }
  }, [html, mode])

  useEffect(() => {
    const preview = previewRef.current

    if (!preview || mode !== 'preview') {
      return
    }
    const previewElement: HTMLElement = preview

    function openDiagram(diagram: HTMLElement): void {
      const svg = diagram.querySelector<SVGSVGElement>('svg')

      if (!svg) {
        return
      }

      const diagrams = Array.from(previewElement.querySelectorAll<HTMLElement>('.mermaid'))
      const diagramIndex = Math.max(diagrams.indexOf(diagram), 0)
      const headings = Array.from(previewElement.querySelectorAll<HTMLHeadingElement>(outlineHeadingSelector))
      let title = `Diagram ${diagramIndex + 1}`

      for (const heading of headings) {
        if (heading.compareDocumentPosition(diagram) & Node.DOCUMENT_POSITION_FOLLOWING) {
          title = heading.textContent?.trim() || title
        } else {
          break
        }
      }

      setActiveDiagram({
        id: `${file.path}-${diagramIndex}`,
        title,
        svg
      })
    }

    function onClick(event: MouseEvent): void {
      const diagram = (event.target as Element | null)?.closest<HTMLElement>('.mermaid[data-diagram-interactive="true"]')

      if (diagram && previewElement.contains(diagram)) {
        openDiagram(diagram)
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return
      }

      const diagram = (event.target as Element | null)?.closest<HTMLElement>('.mermaid[data-diagram-interactive="true"]')

      if (diagram && previewElement.contains(diagram)) {
        event.preventDefault()
        openDiagram(diagram)
      }
    }

    previewElement.addEventListener('click', onClick)
    previewElement.addEventListener('keydown', onKeyDown)

    return () => {
      previewElement.removeEventListener('click', onClick)
      previewElement.removeEventListener('keydown', onKeyDown)
    }
  }, [file.path, html, mode])

  useEffect(() => {
    setActiveDiagram(null)
  }, [file.path, mode, syncEditorHighlightScroll])

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
    if (mode !== 'edit') {
      return
    }

    setSearchMatchCount(editorSearchMatches.length)
    setActiveSearchIndex((currentIndex) =>
      editorSearchMatches.length > 0 ? Math.min(currentIndex, editorSearchMatches.length - 1) : 0
    )
  }, [editorSearchMatches, mode])

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

  useLayoutEffect(() => {
    if (mode !== 'edit') {
      return
    }

    const editor = markdownEditorRef.current
    const matchElement = editorHighlightMatchRef.current
    const activeMatch = editorSearchMatches[activeSearchIndex]

    if (!editor || !matchElement || !activeMatch) {
      return
    }

    editor.setSelectionRange(activeMatch.start, activeMatch.end)
    editor.scrollTop = calculateEditorMatchScrollTop(
      matchElement.offsetTop,
      matchElement.offsetHeight,
      editor.scrollHeight,
      editor.clientHeight
    )
    syncEditorHighlightScroll()
    modeScrollProgressRef.current.edit = calculateScrollProgress(
      editor.scrollTop,
      editor.scrollHeight,
      editor.clientHeight
    )
  }, [activeSearchIndex, draft, editorSearchMatches, mode, syncEditorHighlightScroll])

  useEffect(() => {
    setIsSearchOpen(false)
    setSearchQuery('')
    setSearchMatchCount(0)
    setActiveSearchIndex(0)
  }, [file.path])

  useEffect(() => {
    if (!isPresentation) {
      setIsPresentationToolbarCollapsed(false)
      return
    }

    onModeChange('preview')
    setIsSearchOpen(false)
    setSearchQuery('')
    setIsPresentationToolbarCollapsed(false)
  }, [file.path, isPresentation, onModeChange])

  useEffect(() => {
    if (!shouldSchedulePresentationToolbarCollapse(isPresentation, isPresentationToolbarCollapsed)) {
      return
    }

    const collapseTimer = window.setTimeout(() => {
      setIsPresentationToolbarCollapsed(true)
    }, PRESENTATION_TOOLBAR_IDLE_DELAY)

    return () => window.clearTimeout(collapseTimer)
  }, [isPresentation, isPresentationToolbarCollapsed, presentationToolbarActivity])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (isPresentation) {
        if (event.key === 'Escape') {
          event.preventDefault()
          void onPresentationModeChange(false)
          return
        }

        if (event.metaKey || event.ctrlKey) {
          if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            setPresentationFontSize((currentSize) => changePresentationFontSize(currentSize, 1))
          } else if (event.key === '-') {
            event.preventDefault()
            setPresentationFontSize((currentSize) => changePresentationFontSize(currentSize, -1))
          } else if (event.key === '0') {
            event.preventDefault()
            setPresentationFontSize(DEFAULT_PRESENTATION_FONT_SIZE)
          }
        }

        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setIsSearchOpen(true)
        requestAnimationFrame(() => activateSearchInput(searchInputRef.current))
      }

      if (event.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false)
        setSearchQuery('')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isPresentation, isSearchOpen, onPresentationModeChange])

  function openSearch(): void {
    setIsSearchOpen(true)
    requestAnimationFrame(() => activateSearchInput(searchInputRef.current))
  }

  async function saveDocument(): Promise<void> {
    if (mode === 'edit') {
      prepareModeScrollRestore('preview')
    }

    const didReturnToPreview = await onSave()

    if (!didReturnToPreview) {
      pendingModeScrollRef.current = null
    }
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

  const hasUnsavedChanges = file.isNew || draft !== file.content
  const canStartPresentation = !file.isNew && (isReadOnly || (!isSaving && !hasExternalConflict && !hasUnsavedChanges))

  return (
    <>
      <main ref={readerRef} className={readerClassName} style={readerStyle}>
        {isPresentation && (
          <div className="presentation-toolbar-dock">
            {isPresentationToolbarCollapsed ? (
              <button
                className="presentation-toolbar-toggle"
                type="button"
                aria-label="Show presentation controls"
                aria-expanded="false"
                title="Show presentation controls"
                onClick={() => setIsPresentationToolbarCollapsed(false)}
              >
                Aa
              </button>
            ) : (
              <header
                className="presentation-toolbar"
                onPointerDownCapture={() => setPresentationToolbarActivity((currentActivity) => currentActivity + 1)}
                onKeyDownCapture={() => setPresentationToolbarActivity((currentActivity) => currentActivity + 1)}
              >
                <div className="presentation-toolbar__document">
                  <p>Presentation</p>
                  <h1>{file.fileName}</h1>
                </div>
                <div className="presentation-toolbar__actions" aria-label="Presentation controls">
                  <button
                    type="button"
                    aria-label="Decrease presentation font size"
                    title="Decrease font size (⌘−)"
                    disabled={presentationFontSize <= MIN_PRESENTATION_FONT_SIZE}
                    onClick={() => setPresentationFontSize((currentSize) => changePresentationFontSize(currentSize, -1))}
                  >
                    A−
                  </button>
                  <output aria-label="Presentation font size">{presentationFontSize}px</output>
                  <button
                    type="button"
                    aria-label="Increase presentation font size"
                    title="Increase font size (⌘+)"
                    disabled={presentationFontSize >= MAX_PRESENTATION_FONT_SIZE}
                    onClick={() => setPresentationFontSize((currentSize) => changePresentationFontSize(currentSize, 1))}
                  >
                    A+
                  </button>
                  <button className="presentation-toolbar__exit" type="button" onClick={() => void onPresentationModeChange(false)}>
                    Exit
                  </button>
                </div>
              </header>
            )}
          </div>
        )}
        <div ref={stickyToolsRef} className="reader__sticky-tools">
          <header className="reader__header">
            <div>
              <p className="reader__path">{file.isNew ? 'Not saved yet' : file.path}</p>
              <h1>{file.fileName}</h1>
            </div>
            <div className="reader__actions">
              {!isReadOnly && (
                <div className="segmented-control" aria-label="View mode">
                  <button
                    className={mode === 'edit' ? 'is-active' : ''}
                    type="button"
                    onClick={() => changeViewMode('edit')}
                  >
                    Edit
                  </button>
                  <button
                    className={mode === 'preview' ? 'is-active' : ''}
                    type="button"
                    onClick={() => changeViewMode('preview')}
                  >
                    Preview
                  </button>
                </div>
              )}
              <button className="secondary-button" type="button" onClick={() => window.markdownReader.newFile()}>
                New
              </button>
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
              <button
                className="secondary-button"
                type="button"
                disabled={!canStartPresentation}
                title={canStartPresentation ? 'Enter presentation mode' : 'Wait for the current document to finish saving'}
                onClick={() => void onPresentationModeChange(true)}
              >
                Present
              </button>
              {!isReadOnly && (
                <>
                  {mode === 'edit' && (
                    <span
                      className={`reader__save-status${hasExternalConflict ? ' is-conflict' : hasUnsavedChanges ? ' is-unsaved' : ''}`}
                      aria-live="polite"
                    >
                      {hasExternalConflict ? 'External change' : isSaving ? 'Saving…' : hasUnsavedChanges ? 'Unsaved' : 'Saved'}
                    </span>
                  )}
                  <button
                    className="primary-button primary-button--compact"
                    type="button"
                    disabled={isSaving}
                    onClick={() => void saveDocument()}
                  >
                    {isSaving ? 'Saving' : 'Save'}
                  </button>
                </>
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
                {searchQuery.trim()
                  ? `${searchMatchCount === 0 ? 0 : activeSearchIndex + 1} / ${searchMatchCount}${
                      activeEditorSearchLineNumber ? ` · Line ${activeEditorSearchLineNumber}` : ''
                    }`
                  : 'Type to search'}
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
          <div className="markdown-editor-shell">
            <textarea
              ref={markdownEditorRef}
              className="markdown-editor"
              aria-label="Markdown editor"
              value={draft}
              spellCheck={false}
              onChange={(event) => onDraftChange(event.target.value)}
              onScroll={() => {
                captureModeScrollProgress('edit')
                syncEditorHighlightScroll()
              }}
            />
            {activeEditorSearchMatch && (
              <div className="markdown-editor-highlight-layer" aria-hidden="true">
                <pre ref={editorHighlightMirrorRef} className="markdown-editor-highlight-mirror">
                  {draft.slice(0, activeEditorSearchMatch.start)}
                  <mark ref={editorHighlightMatchRef}>
                    {draft.slice(activeEditorSearchMatch.start, activeEditorSearchMatch.end)}
                  </mark>
                  {draft.slice(activeEditorSearchMatch.end)}
                </pre>
              </div>
            )}
          </div>
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
      {activeDiagram && <MermaidDiagramViewer key={activeDiagram.id} diagram={activeDiagram} onClose={() => setActiveDiagram(null)} />}
    </>
  )
}

export default function App(): ReactElement {
  const [file, setFile] = useState<MarkdownFile | null>(null)
  const [folder, setFolder] = useState<MarkdownFolder | null>(null)
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<ViewMode>('preview')
  const [isSaving, setIsSaving] = useState(false)
  const [hasExternalConflict, setHasExternalConflict] = useState(false)
  const [message, setMessage] = useState('')
  const [isPresentation, setIsPresentation] = useState(false)
  const saveInFlightRef = useRef(false)
  const currentFilePathRef = useRef<string | null>(null)
  const currentFileRef = useRef<MarkdownFile | null>(null)
  const latestDraftRef = useRef('')
  const failedAutoSaveRef = useRef<{ filePath: string; content: string } | null>(null)
  const isPresentationRef = useRef(false)

  currentFilePathRef.current = file && !file.isNew ? file.path : null
  currentFileRef.current = file
  latestDraftRef.current = draft
  isPresentationRef.current = isPresentation

  const changePresentationMode = useCallback(async (enabled: boolean): Promise<void> => {
    if (enabled && !currentFileRef.current) {
      return
    }

    if (enabled) {
      setMode('preview')
    }

    try {
      const actualMode = await window.markdownReader.setPresentationMode(enabled)
      isPresentationRef.current = actualMode
      setIsPresentation(actualMode)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to change presentation mode.'
      setMessage(errorMessage)
    }
  }, [])

  const persistCurrentFile = useCallback(
    async (targetFile: MarkdownFile, contentToSave: string, returnToPreview: boolean): Promise<boolean> => {
      if (saveInFlightRef.current || targetFile.kind === 'html' || targetFile.isNew) {
        return false
      }

      saveInFlightRef.current = true
      setIsSaving(true)
      setMessage('')

      try {
        const savedFile = await window.markdownReader.saveFile(targetFile.path, contentToSave)

        // 文件切换后到达的旧保存响应不能覆盖当前窗口中新打开的文件。
        if (currentFilePathRef.current !== savedFile.path) {
          return false
        }

        failedAutoSaveRef.current = null
        setHasExternalConflict(false)
        setFile(savedFile)

        if (returnToPreview && latestDraftRef.current === contentToSave) {
          setDraft(savedFile.content)
          setMode('preview')
          setMessage('Saved')
          return true
        } else if (returnToPreview) {
          setMessage('Saved. Newer edits will be saved automatically.')
        }

        return false
      } catch (error) {
        if (currentFilePathRef.current === targetFile.path) {
          const errorMessage = error instanceof Error ? error.message : 'Unable to save this file.'
          failedAutoSaveRef.current = returnToPreview ? null : { filePath: targetFile.path, content: contentToSave }
          setMessage(returnToPreview ? errorMessage : `Auto-save failed: ${errorMessage}`)
        }

        return false
      } finally {
        saveInFlightRef.current = false
        setIsSaving(false)
      }
    },
    []
  )

  useEffect(
    () =>
      window.markdownReader.onNewFile((newFile) => {
        if (isPresentationRef.current) {
          void changePresentationMode(false)
        }

        currentFilePathRef.current = null
        currentFileRef.current = newFile
        latestDraftRef.current = ''
        failedAutoSaveRef.current = null
        setHasExternalConflict(false)
        setFile(newFile)
        setDraft('')
        setMode('edit')
        setMessage('Save when you are ready to name this file and choose its location.')
      }),
    [changePresentationMode]
  )

  useEffect(
    () =>
      window.markdownReader.onFileOpened((openedFile) => {
        currentFilePathRef.current = openedFile.path
        latestDraftRef.current = openedFile.content
        failedAutoSaveRef.current = null
        setHasExternalConflict(false)
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
      window.markdownReader.onFileUpdated((updatedFile) => {
        const currentFile = currentFileRef.current

        if (!currentFile || currentFile.path !== updatedFile.path) {
          return
        }

        if (latestDraftRef.current !== currentFile.content) {
          setHasExternalConflict(true)
          setMessage('This file changed outside Markdown Reader. Your unsaved edits were kept; click Save to overwrite the external version.')
          return
        }

        currentFileRef.current = updatedFile
        latestDraftRef.current = updatedFile.content
        failedAutoSaveRef.current = null
        setHasExternalConflict(false)
        setFile(updatedFile)
        setDraft(updatedFile.content)
        setMessage('Updated from disk.')
      }),
    []
  )

  useEffect(
    () =>
      window.markdownReader.onFolderOpened((openedFolder) => {
        if (isPresentationRef.current) {
          void changePresentationMode(false)
        }

        currentFilePathRef.current = null
        latestDraftRef.current = ''
        failedAutoSaveRef.current = null
        setHasExternalConflict(false)
        setFolder(openedFolder)
        setFile(null)
        setDraft('')
        setMode('preview')
        setMessage(openedFolder.files.length > 0 ? 'Select a Markdown file from the folder.' : 'No Markdown files found.')
      }),
    [changePresentationMode]
  )

  useEffect(
    () =>
      window.markdownReader.onFolderUpdated((updatedFolder) => {
        setFolder(updatedFolder)
      }),
    []
  )

  useEffect(() => {
    let isMounted = true
    const stopListening = window.markdownReader.onPresentationModeChanged((enabled) => {
      if (!isMounted) {
        return
      }

      isPresentationRef.current = enabled
      setIsPresentation(enabled)
    })

    void window.markdownReader.getPresentationMode().then(
      (enabled) => {
        if (isMounted) {
          isPresentationRef.current = enabled
          setIsPresentation(enabled)
        }
      },
      () => {
        // 演示模式查询失败不影响普通阅读功能。
      }
    )

    return () => {
      isMounted = false
      stopListening()
    }
  }, [])

  useEffect(() => {
    if (
      !file ||
      file.isNew ||
      file.kind === 'html' ||
      mode !== 'edit' ||
      draft === file.content ||
      isSaving ||
      hasExternalConflict
    ) {
      return
    }

    if (failedAutoSaveRef.current?.filePath === file.path && failedAutoSaveRef.current.content === draft) {
      return
    }

    const autoSaveTimer = window.setTimeout(() => {
      void persistCurrentFile(file, draft, false)
    }, 1000)

    return () => window.clearTimeout(autoSaveTimer)
  }, [draft, file, hasExternalConflict, isSaving, mode, persistCurrentFile])

  async function openFolderFile(filePath: string): Promise<void> {
    setMessage('')

    try {
      const openedFile = await window.markdownReader.readFile(filePath)

      if (!openedFile) {
        return
      }
      currentFilePathRef.current = openedFile.path
      latestDraftRef.current = openedFile.content
      failedAutoSaveRef.current = null
      setHasExternalConflict(false)
      setFile(openedFile)
      setDraft(openedFile.content)
      setMode('preview')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to open this file.'
      setMessage(errorMessage)
    }
  }

  async function saveCurrentFile(): Promise<boolean> {
    if (!file) {
      return false
    }

    if (file.isNew) {
      if (saveInFlightRef.current) {
        return false
      }

      saveInFlightRef.current = true
      setIsSaving(true)
      setMessage('')

      try {
        const savedFile = await window.markdownReader.saveNewFile(draft, file.directory || folder?.path)

        if (!savedFile) {
          return false
        }

        currentFilePathRef.current = savedFile.path
        currentFileRef.current = savedFile
        latestDraftRef.current = savedFile.content
        failedAutoSaveRef.current = null
        setHasExternalConflict(false)
        setFile(savedFile)
        setDraft(savedFile.content)
        setMode('preview')
        setMessage('Saved')
        return true
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unable to save this file.'
        setMessage(errorMessage)
        return false
      } finally {
        saveInFlightRef.current = false
        setIsSaving(false)
      }
    }

    return persistCurrentFile(file, draft, true)
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
              <button className="primary-button" type="button" onClick={() => window.markdownReader.newFile()}>
                New File
              </button>
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
        {!isPresentation && <div className="window-drag-region" aria-hidden="true" />}
        <div className={`workspace${isPresentation ? ' workspace--presentation' : ''}`}>
          {!isPresentation && (
            <FolderSidebar folder={folder} activePath={file.path} onOpenFile={(filePath) => void openFolderFile(filePath)} />
          )}
          <Reader
            key="reader"
            file={file}
            draft={draft}
            mode={mode}
            isSaving={isSaving}
            hasExternalConflict={hasExternalConflict}
            message={message}
            onDraftChange={setDraft}
            onModeChange={setMode}
            onSave={saveCurrentFile}
            isPresentation={isPresentation}
            onPresentationModeChange={changePresentationMode}
            isEmbedded={!isPresentation}
          />
        </div>
      </>
    )
  }

  return (
    <>
      {!isPresentation && <div className="window-drag-region" aria-hidden="true" />}
      <Reader
        file={file}
        draft={draft}
        mode={mode}
        isSaving={isSaving}
        hasExternalConflict={hasExternalConflict}
        message={message}
        onDraftChange={setDraft}
        onModeChange={setMode}
        onSave={saveCurrentFile}
        isPresentation={isPresentation}
        onPresentationModeChange={changePresentationMode}
      />
    </>
  )
}
