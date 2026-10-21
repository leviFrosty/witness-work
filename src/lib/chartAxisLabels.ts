export type AxisLabel = {
  key: string
  label: string
  /** Where the label centers along the plot, 0 (left edge) to 1 (right edge). */
  position: number
  /** The label's rendered width. */
  width: number
}

export type PlacedAxisLabel = AxisLabel & {
  /** The label's left edge, from the plot's left edge. */
  left: number
}

/**
 * Places a chart's x-axis labels whose text can be wider than the room between
 * them (large text): every label if they fit, otherwise every second, third…
 * starting from the first, the fewest skipped that keep `gap` between
 * neighbors. Each label centers on its position, nudged inward to stay within
 * the plot plus its insets.
 */
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
