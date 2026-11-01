import type { ReactElement } from 'react'
import type { ProgressCardSize } from '@/lib/progressCards'

export type ProgressCardProps = {
  month: number
  year: number
  size: ProgressCardSize

  wrapEditTrigger?: (trigger: ReactElement) => ReactElement
}

export type YearCardProps = {
  serviceYear: number
  size: ProgressCardSize
}

export type AllTimeCardProps = {
  size: ProgressCardSize
}
