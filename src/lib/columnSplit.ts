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

    if (height < bestHeight) {
      best = split
      bestHeight = height
    }
  }
  return best
}
