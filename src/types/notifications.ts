import type { ReactNode } from 'react'
import type { AppIcon } from '@/components/ui/LucideIcon'

/** Where a tray item comes from. Bounded, so it's safe as an analytics value. */
export type NotificationKind =
  | 'backup'
  | 'previous_report'
  | 'rollover'
  | 'missed_follow_up'
  | 'auxiliary_month'
  | 'whats_new'
  | 'milestone_update'
  | 'notes_import'
  | 'supporter_nudge'
  | 'supporter_survey'
  | 'data_protection_retention'
  | 'buddies'
  /** Test items from the Tools screen. */
  | 'dev_test'

export type NotificationTone = 'accent' | 'warn' | 'supporter'

export type NotificationAction = {
  /** Bounded analytics name, e.g. `submit`. */
  id: string
  label: string
  onPress: () => void
  /** Runs without closing the tray, for actions that don't navigate. */
  inPlace?: boolean
}

export type NotificationRowProps = {
  unread: boolean
  dismiss: () => void
  /** Closes the tray, then runs the action (e.g. navigating). */
  closeThen: (action: () => void) => void
}

/**
 * One entry in the Home notifications tray. Features derive these from their
 * own state; an item disappears on its own once its condition clears (report
 * submitted, backup made, Follow-up rescheduled).
 */
export type NotificationItem = {
  /**
   * Stable per occurrence, e.g. `report:2026-08`, so dismissing August's report
   * doesn't hide September's.
   */
  id: string
  kind: NotificationKind
  /** When it came in (epoch ms). Omit to use when the tray first listed it. */
  at?: number
  icon?: AppIcon
  tone?: NotificationTone
  title: string
  description?: string
  /** At most two; the first is the primary action and the row's tap target. */
  actions?: NotificationAction[]
  /** Survives "Clear All", e.g. an invitation still waiting on an answer. */
  sticky?: boolean
  /** Source-side effects of a dismissal, like a snooze or cooldown stamp. */
  onDismiss?: () => void
  /** Runs once each time the tray opens with this item listed. */
  onView?: () => void
  /** Replaces the standard row, for items with their own layout. */
  render?: (props: NotificationRowProps) => ReactNode
}
