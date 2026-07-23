export type DiagramSize = {
  width: number
  height: number
}

export type DiagramTransform = {
  scale: number
  x: number
  y: number
}

const VIEWPORT_PADDING = 48
const MINIMUM_VISIBLE_SIZE = 88

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

export function calculateFitTransform(diagram: DiagramSize, viewportWidth: number, viewportHeight: number): DiagramTransform {
  const availableWidth = Math.max(viewportWidth - VIEWPORT_PADDING * 2, 1)
  const availableHeight = Math.max(viewportHeight - VIEWPORT_PADDING * 2, 1)
  const scale = Math.min(availableWidth / diagram.width, availableHeight / diagram.height, 1)

  return {
    scale,
    x: (viewportWidth - diagram.width * scale) / 2,
    y: (viewportHeight - diagram.height * scale) / 2
  }
}

export function constrainDiagramTransform(
  transform: DiagramTransform,
  diagram: DiagramSize,
  viewportWidth: number,
  viewportHeight: number
): DiagramTransform {
  const scaledWidth = diagram.width * transform.scale
  const scaledHeight = diagram.height * transform.scale
  const visibleWidth = Math.min(MINIMUM_VISIBLE_SIZE, scaledWidth / 2, viewportWidth / 3)
  const visibleHeight = Math.min(MINIMUM_VISIBLE_SIZE, scaledHeight / 2, viewportHeight / 3)

  return {
    ...transform,
    x: clamp(transform.x, visibleWidth - scaledWidth, viewportWidth - visibleWidth),
    y: clamp(transform.y, visibleHeight - scaledHeight, viewportHeight - visibleHeight)
  }
}

export function calculateZoomTransform(
  currentTransform: DiagramTransform,
  pointX: number,
  pointY: number,
  factor: number,
  minimumScale: number,
  maximumScale: number
): DiagramTransform {
  const nextScale = clamp(currentTransform.scale * factor, minimumScale, maximumScale)

  if (nextScale === currentTransform.scale) {
    return currentTransform
  }

  const diagramPointX = (pointX - currentTransform.x) / currentTransform.scale
  const diagramPointY = (pointY - currentTransform.y) / currentTransform.scale

  return {
    scale: nextScale,
    x: pointX - diagramPointX * nextScale,
    y: pointY - diagramPointY * nextScale
  }
}
