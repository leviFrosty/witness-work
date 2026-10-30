export type Rect = { x: number; y: number; width: number; height: number }
export type Size = { width: number; height: number }

export type OverlaySide = 'top' | 'bottom' | 'left' | 'right'
export type OverlayAlign = 'start' | 'center' | 'end'

export type OverlayPlacement = {
  side?: OverlaySide
  /** Along the anchor's edge: `start` lines up the near edges. */
  align?: OverlayAlign
  /** Space between the anchor and the overlay. */
  gap?: number
  /** Space kept clear of the viewport's edges. */
  margin?: number
  /** Reading direction, which `align` follows. */
  rtl?: boolean
}

export type PlacedOverlay = {
  left: number
  top: number
  /** The room on the chosen side, for content that scrolls past it. */
  maxHeight: number
  side: OverlaySide
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max))

const OPPOSITE: Record<OverlaySide, OverlaySide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/**
 * Where an overlay of `size` goes beside `anchor` in a `viewport`: on the
 * preferred side, flipped to the other when it doesn't fit and the other has
 * more room, and kept inside the viewport's margin on the other axis. All in
 * viewport coordinates.
 */
export function placeOverlay({
  anchor,
  size,
  viewport,
  placement = {},
}: {
  anchor: Rect
  size: Size
  viewport: Size
  placement?: OverlayPlacement
}): PlacedOverlay {
  const {
    side: preferred = 'bottom',
    align = 'start',
    gap = 6,
    margin = 8,
    rtl = false,
  } = placement

  const room = (side: OverlaySide) => {
    switch (side) {
      case 'top':
        return anchor.y - gap - margin
      case 'bottom':
        return viewport.height - (anchor.y + anchor.height) - gap - margin
      case 'left':
        return anchor.x - gap - margin
      case 'right':
        return viewport.width - (anchor.x + anchor.width) - gap - margin
    }
  }
  const need = (side: OverlaySide) =>
    side === 'top' || side === 'bottom' ? size.height : size.width

  const opposite = OPPOSITE[preferred]
  const side =
    need(preferred) <= room(preferred) || room(preferred) >= room(opposite)
      ? preferred
      : opposite

  const vertical = side === 'top' || side === 'bottom'
  // `start` follows the reading direction: the right edge in RTL.
  const physicalAlign: OverlayAlign =
    align === 'center'
      ? 'center'
      : (align === 'start') === !rtl
        ? 'start'
        : 'end'

  const alongX = () => {
    const x =
      physicalAlign === 'start'
        ? anchor.x
        : physicalAlign === 'end'
          ? anchor.x + anchor.width - size.width
          : anchor.x + anchor.width / 2 - size.width / 2
    return clamp(
      x,
      margin,
      Math.max(margin, viewport.width - size.width - margin)
    )
  }
  const alongY = () => {
    const y =
      align === 'start'
        ? anchor.y
        : align === 'end'
          ? anchor.y + anchor.height - size.height
          : anchor.y + anchor.height / 2 - size.height / 2
    return clamp(
      y,
      margin,
      Math.max(margin, viewport.height - size.height - margin)
    )
  }

  const maxHeight = Math.max(
    vertical ? room(side) : viewport.height - margin * 2,
    0
  )

  if (vertical) {
    const height = Math.min(size.height, maxHeight)
    return {
      left: alongX(),
      top:
        side === 'bottom'
          ? anchor.y + anchor.height + gap
          : anchor.y - gap - height,
      maxHeight,
      side,
    }
  }
  return {
    left:
      side === 'right'
        ? anchor.x + anchor.width + gap
        : anchor.x - gap - size.width,
    top: alongY(),
    maxHeight,
    side,
  }
}
