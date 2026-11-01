import type { ReactNode } from 'react'
import type { SnapPoint } from '@expo/ui'

export type SheetSnapPoint = SnapPoint

export type SheetProps = {
  open: boolean

  onOpenChange: (open: boolean) => void

  onClosed?: () => void

  snapPoints?: SheetSnapPoint[]

  dismissible?: boolean

  backgroundColor?: string
  testID?: string
  children: ReactNode
}

export type NativeSheetProps = {
  open: boolean

  onDismiss: () => void

  onClosed: () => void
  snapPoints?: SheetSnapPoint[]
  dismissible: boolean
  backgroundColor: string

  colorScheme?: 'light' | 'dark'
  testID?: string
  children: ReactNode
}
