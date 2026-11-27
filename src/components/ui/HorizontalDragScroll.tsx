import type { ReactNode } from 'react'

export type HorizontalDragEnd = {
  deltaX: number
  scrollLeft: number
  maxScroll: number
}

export type HorizontalDragScrollProps = {
  children: ReactNode
  enabled?: boolean
  snapPadding?: number
  onDragStart?: () => void
  onDragEnd?: (info: HorizontalDragEnd) => void
  onWheelScroll?: () => void
}

export default function HorizontalDragScroll({
  children,
}: HorizontalDragScrollProps) {
  return children
}
