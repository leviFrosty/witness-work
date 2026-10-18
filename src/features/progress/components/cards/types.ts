import type { ReactElement } from 'react'
import type { ProgressCardSize } from '@/lib/progressCards'

/** What every Progress card is given: the month on screen and its size. */
export type ProgressCardProps = {
  month: number
  year: number
  size: ProgressCardSize
  /**
   * Wraps the part of the card a long press starts editing from, for a card
   * full of its own controls (the Days list). Other cards long-press whole.
   */
  wrapEditTrigger?: (trigger: ReactElement) => ReactElement
}
