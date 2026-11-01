import type { ReactNode } from 'react'
import type { AppIcon } from '@/components/ui/LucideIcon'

export type NotificationKind =
  | 'backup'
  | 'icloud_sync'
  | 'previous_report'
  | 'rollover'
  | 'missed_follow_up'
  | 'reminder'
  | 'auxiliary_month'
  | 'hours_logging'
  | 'whats_new'
  | 'pending_update'
  | 'update_reveal'
  | 'supporter_nudge'
  | 'supporter_survey'
  | 'supporter_note'
  | 'data_protection_retention'
  | 'buddies'
  | 'calendar_sync'
  | 'announcement'
  | 'badge'
  | 'pet_unlock'
  | 'dev_test'

export type NotificationTone = 'accent' | 'warn' | 'error' | 'supporter'

export type NotificationAction = {
  id: string
  label: string
  onPress: () => void

  inPlace?: boolean
}

export type NotificationRowProps = {
  unread: boolean
  dismiss: () => void

  closeThen: (action: () => void) => void
}

export type NotificationItem = {
  id: string
  kind: NotificationKind

  at?: number
  icon?: AppIcon

  art?: (size: number) => ReactNode
  tone?: NotificationTone
  title: string
  description?: string

  actions?: NotificationAction[]

  sticky?: boolean

  social?: boolean

  onDismiss?: () => void

  onView?: () => void

  render?: (props: NotificationRowProps) => ReactNode
}
