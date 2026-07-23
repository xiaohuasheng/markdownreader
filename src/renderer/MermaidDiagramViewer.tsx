import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
  WheelEvent as ReactWheelEvent
} from 'react'
import {
  calculateFitTransform,
  calculateZoomTransform,
  constrainDiagramTransform
} from './diagramViewport'
import type { DiagramSize, DiagramTransform } from './diagramViewport'

export type MermaidDiagramSnapshot = {
  id: string
  title: string
  svg: SVGSVGElement
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

const MAX_SCALE = 4
const ZOOM_STEP = 1.24
const DEFAULT_DIAGRAM_WIDTH = 1200
const DEFAULT_DIAGRAM_HEIGHT = 800

function readDiagramSize(svg: SVGSVGElement): DiagramSize {
  const viewBox = svg.viewBox.baseVal
  const attributeWidth = Number.parseFloat(svg.getAttribute('width') ?? '')
  const attributeHeight = Number.parseFloat(svg.getAttribute('height') ?? '')
  const width = viewBox.width || attributeWidth || DEFAULT_DIAGRAM_WIDTH
  const height = viewBox.height || attributeHeight || DEFAULT_DIAGRAM_HEIGHT

  return {
    width: Math.max(width, 1),
    height: Math.max(height, 1)
  }
}

export function MermaidDiagramViewer({
  diagram,
  onClose
}: {
  diagram: MermaidDiagramSnapshot
  onClose: () => void
}): ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null)
  const svgHostRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const transformRef = useRef<DiagramTransform>({ scale: 1, x: 0, y: 0 })
  const minimumScaleRef = useRef(1)
  const dragStateRef = useRef<DragState | null>(null)
  const [transform, setTransform] = useState<DiagramTransform>(transformRef.current)
  const [isDragging, setIsDragging] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const diagramSize = useMemo(() => readDiagramSize(diagram.svg), [diagram.svg])
  const svgClone = useMemo(() => diagram.svg.cloneNode(true) as SVGSVGElement, [diagram.svg])

  const applyTransform = useCallback((nextTransform: DiagramTransform): void => {
    transformRef.current = nextTransform
    setTransform(nextTransform)
  }, [])

  const constrainTransform = useCallback(
    (nextTransform: DiagramTransform): DiagramTransform => {
      const viewport = viewportRef.current

      if (!viewport) {
        return nextTransform
      }

      return constrainDiagramTransform(nextTransform, diagramSize, viewport.clientWidth, viewport.clientHeight)
    },
    [diagramSize]
  )

  const fitDiagram = useCallback((): void => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    const fitTransform = calculateFitTransform(diagramSize, viewport.clientWidth, viewport.clientHeight)
    minimumScaleRef.current = fitTransform.scale
    applyTransform(fitTransform)
    setIsReady(true)
  }, [applyTransform, diagramSize])

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number): void => {
      const viewport = viewportRef.current

      if (!viewport) {
        return
      }

      const currentTransform = transformRef.current
      const viewportRect = viewport.getBoundingClientRect()
      const pointX = clientX - viewportRect.left
      const pointY = clientY - viewportRect.top
      const zoomedTransform = calculateZoomTransform(
        currentTransform,
        pointX,
        pointY,
        factor,
        minimumScaleRef.current,
        MAX_SCALE
      )
      const nextTransform = constrainTransform(zoomedTransform)

      applyTransform(nextTransform)
    },
    [applyTransform, constrainTransform]
  )

  const zoomFromCenter = useCallback(
    (factor: number): void => {
      const viewport = viewportRef.current

      if (!viewport) {
        return
      }

      const viewportRect = viewport.getBoundingClientRect()
      zoomAt(viewportRect.left + viewportRect.width / 2, viewportRect.top + viewportRect.height / 2, factor)
    },
    [zoomAt]
  )

  useEffect(() => {
    const svgHost = svgHostRef.current

    if (!svgHost) {
      return
    }

    // 使用 Mermaid 已生成的 SVG 副本，保持矢量清晰度并避免修改正文中的图表。
    svgClone.removeAttribute('width')
    svgClone.removeAttribute('height')
    svgClone.style.removeProperty('max-width')
    svgClone.style.width = '100%'
    svgClone.style.height = '100%'
    svgClone.setAttribute('aria-hidden', 'true')
    svgHost.replaceChildren(svgClone)

    return () => {
      svgClone.remove()
    }
  }, [svgClone])

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport) {
      return
    }

    const animationFrame = window.requestAnimationFrame(fitDiagram)
    const resizeObserver = new ResizeObserver(fitDiagram)
    resizeObserver.observe(viewport)
    closeButtonRef.current?.focus()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
    }
  }, [fitDiagram])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
        return
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        zoomFromCenter(ZOOM_STEP)
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        zoomFromCenter(1 / ZOOM_STEP)
      } else if (event.key === '0') {
        event.preventDefault()
        fitDiagram()
      }
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [fitDiagram, onClose, zoomFromCenter])

  function onWheel(event: ReactWheelEvent<HTMLDivElement>): void {
    event.preventDefault()
    const factor = Math.exp(-event.deltaY * 0.0016)
    zoomAt(event.clientX, event.clientY, factor)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return
    }

    const currentTransform = transformRef.current
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: currentTransform.x,
      originY: currentTransform.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    applyTransform(
      constrainTransform({
        ...transformRef.current,
        x: dragState.originX + event.clientX - dragState.startX,
        y: dragState.originY + event.clientY - dragState.startY
      })
    )
  }

  function stopDragging(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragStateRef.current = null
    setIsDragging(false)
  }

  function onDoubleClick(event: ReactMouseEvent<HTMLDivElement>): void {
    zoomAt(event.clientX, event.clientY, ZOOM_STEP * ZOOM_STEP)
  }

  return (
    <div
      className="diagram-viewer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section className="diagram-viewer__dialog" role="dialog" aria-modal="true" aria-labelledby="diagram-viewer-title">
        <header className="diagram-viewer__toolbar">
          <div className="diagram-viewer__title">
            <p>Mermaid diagram</p>
            <h2 id="diagram-viewer-title">{diagram.title}</h2>
          </div>
          <div className="diagram-viewer__controls" aria-label="Diagram controls">
            <button type="button" title="Zoom out (-)" aria-label="Zoom out" onClick={() => zoomFromCenter(1 / ZOOM_STEP)}>
              −
            </button>
            <output aria-label="Current zoom">{Math.round(transform.scale * 100)}%</output>
            <button type="button" title="Zoom in (+)" aria-label="Zoom in" onClick={() => zoomFromCenter(ZOOM_STEP)}>
              +
            </button>
            <button className="diagram-viewer__fit" type="button" title="Fit to window (0)" onClick={fitDiagram}>
              Fit
            </button>
            <button ref={closeButtonRef} className="diagram-viewer__close" type="button" title="Close (Esc)" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div
          ref={viewportRef}
          className={`diagram-viewer__viewport${isDragging ? ' is-dragging' : ''}`}
          tabIndex={0}
          aria-label="Diagram canvas. Use the mouse wheel to zoom and drag to move."
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
          onDoubleClick={onDoubleClick}
        >
          <div
            className="diagram-viewer__canvas"
            style={{
              width: `${diagramSize.width}px`,
              height: `${diagramSize.height}px`,
              opacity: isReady ? 1 : 0,
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`
            }}
          >
            <div ref={svgHostRef} className="diagram-viewer__svg" />
          </div>
          <p className="diagram-viewer__hint">Scroll to zoom · Drag to move · Double-click to zoom in</p>
        </div>
      </section>
    </div>
  )
}
