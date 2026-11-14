export function moveItem<T>(
  order: readonly T[],
  from: number,
  to: number
): T[] {
  const next = [...order]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function moveVisible<K>(
  order: readonly K[],
  visible: readonly K[],
  from: number,
  to: number
): readonly K[] {
  const key = visible[from]
  const anchor = visible[to]
  if (key === undefined || anchor === undefined || key === anchor) return order
  const next = order.filter((k) => k !== key)
  const anchorIdx = next.indexOf(anchor)
  if (anchorIdx < 0) return order
  next.splice(to < from ? anchorIdx : anchorIdx + 1, 0, key)
  return next
}

export function droppedIndex(
  sources: number[],
  destination: number
): { from: number; to: number } | null {
  const [from] = sources
  if (from === undefined || sources.length !== 1) return null
  const to = destination > from ? destination - 1 : destination
  return to === from ? null : { from, to }
}
