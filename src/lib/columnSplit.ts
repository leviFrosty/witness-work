/**
 * Where to break sections into two columns read in order, the leading column
 * first: the break that leaves the taller column shortest. Sections not yet
 * measured count as the average of those that are. Never leaves the leading
 * column empty.
 */
export function splitInReadingOrder(
  heights: (number | undefined)[],
  gap = 0
): number {
  const count = heights.length
  if (count < 2) return count
  const known = heights.filter(
    (height): height is number => height !== undefined
  )
  const average = known.length
    ? known.reduce((sum, height) => sum + height, 0) / known.length
    : 1
  const sizes = heights.map((height) => height ?? average)
  // Empty sections take no room and no gap.
  const span = (from: number, to: number) => {
    let total = 0
    let shown = 0
    for (let i = from; i < to; i++) {
      total += sizes[i]
      if (sizes[i] > 0) shown++
    }
    return total + Math.max(0, shown - 1) * gap
  }
  let best = Math.ceil(count / 2)
  let bestHeight = Infinity
  for (let split = count - 1; split >= 1; split--) {
    const height = Math.max(span(0, split), span(split, count))
    // Ties go to the longer leading column, which is read first.
    if (height < bestHeight) {
      best = split
      bestHeight = height
    }
  }
  return best
}
