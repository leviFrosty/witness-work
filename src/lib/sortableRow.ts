export type RowWidths = Record<string, number>

export function rowSlots(
  order: readonly string[],
  widths: RowWidths,
  gap: number
): Record<string, number> {
  'worklet'
  const slots: Record<string, number> = {}
  let x = 0
  for (const key of order) {
    slots[key] = x
    x += (widths[key] ?? 0) + gap
  }
  return slots
}

export function rowLength(
  order: readonly string[],
  widths: RowWidths,
  gap: number
): number {
  'worklet'
  let length = 0
  for (const key of order) length += widths[key] ?? 0
  return length + Math.max(0, order.length - 1) * gap
}

export function reorderForDrag(
  order: readonly string[],
  key: string,
  left: number,
  widths: RowWidths,
  gap: number
): readonly string[] {
  'worklet'
  let index = order.indexOf(key)
  if (index < 0) return order
  const middle = left + (widths[key] ?? 0) / 2
  let next = order
  for (;;) {
    const slots = rowSlots(next, widths, gap)
    const after = next[index + 1]
    const before = next[index - 1]
    let target = index
    if (
      after !== undefined &&
      middle > slots[after] + (widths[after] ?? 0) / 2
    ) {
      target = index + 1
    } else if (
      before !== undefined &&
      middle < slots[before] + (widths[before] ?? 0) / 2
    ) {
      target = index - 1
    }
    if (target === index) return next
    const moved = [...next]
    moved[index] = moved[target]
    moved[target] = key
    next = moved
    index = target
  }
}

export function isInDragHandle(
  x: number,
  width: number,
  handleWidth: number,
  rtl: boolean
): boolean {
  'worklet'
  if (handleWidth <= 0 || width <= 0) return false
  return rtl ? x <= handleWidth : x >= width - handleWidth
}
