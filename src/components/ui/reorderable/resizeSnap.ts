import type { PointerAccessory } from '../../../../modules/pointer-style'

export type ReorderableSizeOption<Size extends string> = {
  size: Size
  width?: number
  height?: number
}

const HYSTERESIS = 16

const STEP = 70

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

export const snapResize = <Size extends string>({
  options,
  current,
  start,
  forward,
  down,
}: {
  options: ReorderableSizeOption<Size>[]
  current: Size

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
