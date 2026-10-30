import type { SheetSnapPoint } from '@/components/ui/Sheet.types'

const MIN_HEIGHT = 480
/** The share of the window a dialog may take. */
export const MAX_HEIGHT_RATIO = 0.85

/** The height a snap point asks for in a window `viewport` tall, in px. */
export function dialogHeight(
  snapPoints: SheetSnapPoint[] | undefined,
  viewport: number
) {
  if (!snapPoints?.length) return undefined
  const largest = Math.max(
    ...snapPoints.map((point) =>
      point === 'half'
        ? viewport * 0.5
        : point === 'full'
          ? viewport
          : 'fraction' in point
            ? viewport * point.fraction
            : point.height
    )
  )
  return Math.round(
    Math.min(viewport * MAX_HEIGHT_RATIO, Math.max(MIN_HEIGHT, largest))
  )
}
