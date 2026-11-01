export type AxisLabel = {
  key: string
  label: string

  position: number

  width: number
}

export type PlacedAxisLabel = AxisLabel & {
  left: number
}

export const placeAxisLabels = (
  labels: readonly AxisLabel[],
  {
    rowWidth,
    insetLeft = 0,
    insetRight = 0,
    gap,
  }: { rowWidth: number; insetLeft?: number; insetRight?: number; gap: number }
): PlacedAxisLabel[] => {
  const place = (label: AxisLabel): PlacedAxisLabel => {
    const centered = label.position * rowWidth - label.width / 2
    const max = rowWidth + insetRight - label.width
    return { ...label, left: Math.max(-insetLeft, Math.min(max, centered)) }
  }
  for (let step = 1; step <= labels.length; step++) {
    const kept = labels.filter((_, i) => i % step === 0).map(place)
    const fits = kept.every(
      (label, i) =>
        i === 0 || label.left >= kept[i - 1].left + kept[i - 1].width + gap
    )
    if (fits) return kept
  }
  return []
}
