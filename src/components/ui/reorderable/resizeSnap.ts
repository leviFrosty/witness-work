import type { PointerAccessory } from '../../../../modules/pointer-style'

/** A size an item can take, with the frame it has at that size where known. */
export type ReorderableSizeOption<Size extends string> = {
  size: Size
  width?: number
  height?: number
}

/** How much nearer another size must be before a drag switches to it. */
const HYSTERESIS = 16
/** Without frames to compare, how far a drag steps one size. */
const STEP = 70

/** Which ways the options' frames differ, for the handle's pointer arrows. */
export const resizeAccessories = <Size extends string>(
  options: ReorderableSizeOption<Size>[]
): PointerAccessory[] => {
  const widths = new Set(options.map((option) => option.width))
  const heights = new Set(options.map((option) => option.height))
  return [
    ...(widths.size > 1 ? (['left', 'right'] as const) : []),
    ...(heights.size > 1 ? (['up', 'down'] as const) : []),
  ]
}

/**
 * The size a resize handle dragged by `forward` and `down` points from its
 * start should snap to: the option whose frame is nearest the dragged corner,
 * and only once it's clearly nearer than the current one, so the size doesn't
 * flicker at the halfway point. Options without frames that differ (every one
 * full width, say) step one size per `STEP` points instead.
 */
export const snapResize = <Size extends string>({
  options,
  current,
  start,
  forward,
  down,
}: {
  /** Smallest first. */
  options: ReorderableSizeOption<Size>[]
  current: Size
  /** The item's frame and size when the drag began. */
  start: { width: number; height: number; size: Size }
  forward: number
  down: number
}): Size => {
  const startIndex = options.findIndex((option) => option.size === start.size)
  if (!resizeAccessories(options).length) {
    const index = Math.max(
      0,
      Math.min(
        options.length - 1,
        startIndex + Math.round((forward + down) / 2 / STEP)
      )
    )
    return options[index]?.size ?? current
  }
  const want = { width: start.width + forward, height: start.height + down }
  // Given frames are estimates (text size changes them); line them up with the
  // frame the item really had at the size it started at.
  const from = options[startIndex]
  const bias = {
    width: from?.width === undefined ? 0 : start.width - from.width,
    height: from?.height === undefined ? 0 : start.height - from.height,
  }
  const distance = (option: ReorderableSizeOption<Size>) =>
    Math.abs(
      (option.width === undefined ? want.width : option.width + bias.width) -
        want.width
    ) +
    Math.abs(
      (option.height === undefined
        ? want.height
        : option.height + bias.height) - want.height
    )
  let best = options.find((option) => option.size === current)
  if (!best) return current
  for (const option of options) {
    if (distance(option) + HYSTERESIS < distance(best)) best = option
  }
  return best.size
}
