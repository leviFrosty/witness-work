export type Rect = { x: number; y: number; width: number; height: number }

export type ZoomTransform = {
  scale: number
  translateX: number
  translateY: number
}

export function zoomTransform(
  frame: Rect,
  from: Rect,
  to: Rect,
  progress: number
): ZoomTransform {
  'worklet'
  if (from.width <= 0 || to.width <= 0 || frame.width <= 0) {
    return { scale: 1, translateX: 0, translateY: 0 }
  }
  const scale = Math.pow(to.width / from.width, progress)
  const frameX = frame.x + frame.width / 2
  const frameY = frame.y + frame.height / 2
  const fromX = from.x + from.width / 2
  const fromY = from.y + from.height / 2
  const centerX = fromX + (to.x + to.width / 2 - fromX) * progress
  const centerY = fromY + (to.y + to.height / 2 - fromY) * progress
  return {
    scale,
    translateX: centerX - frameX - scale * (fromX - frameX),
    translateY: centerY - frameY - scale * (fromY - frameY),
  }
}

export function applyZoom(
  frame: Rect,
  transform: ZoomTransform,
  point: { x: number; y: number }
) {
  const frameX = frame.x + frame.width / 2
  const frameY = frame.y + frame.height / 2
  return {
    x: frameX + transform.translateX + transform.scale * (point.x - frameX),
    y: frameY + transform.translateY + transform.scale * (point.y - frameY),
  }
}
