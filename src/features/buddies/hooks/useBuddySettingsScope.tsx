import { createContext, PropsWithChildren, useContext } from 'react'
import { create } from 'zustand'
import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  type Buddy,
  type BuddyAlertKey,
  buddyAlertSettings,
  type BuddySettingKey,
  type BuddySettings,
  type BuddySettingSource,
  buddySettings,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export type BuddySettingsUndo = {
  inboxId: string | null
  revert: () => void
}

export const useBuddySettingsUndos = create<{ undos: BuddySettingsUndo[] }>(
  () => ({ undos: [] })
)

export function recordBuddySettingsUndo(undo: BuddySettingsUndo) {
  useBuddySettingsUndos.setState(({ undos }) => ({ undos: [...undos, undo] }))
}

export function undoBuddySettings(): BuddySettingsUndo | undefined {
  const last = useBuddySettingsUndos.getState().undos.at(-1)
  if (!last) return undefined
  useBuddySettingsUndos.setState(({ undos }) => ({ undos: undos.slice(0, -1) }))
  last.revert()
  analytics.capture('buddies_settings_undone', {
    scope: last.inboxId ? 'buddy' : 'all',
  })
  return last
}

type Scope = {
  buddy: Buddy | null
  record: (undo: BuddySettingsUndo) => void

  select?: (inboxId: string | null) => void
}

const ScopeContext = createContext<Scope>({ buddy: null, record: () => {} })

export function BuddySettingsScope({
  buddy,
  record,
  select,
  children,
}: PropsWithChildren<Scope>) {
  return (
    <ScopeContext value={{ buddy, record, select }}>{children}</ScopeContext>
  )
}

export function useBuddySettingsScope(): Scope {
  return useContext(ScopeContext)
}

const warn = (error: unknown) => logger.warn('[buddies] settings', error)

export type ScopedSetting<T> = {
  value: T

  source: BuddySettingSource

  inherited: T

  overriddenBy: { buddy: Buddy; value: T }[]
  set: (value: T) => void

  reset?: () => void
}

const SETTING_NAMES: Record<BuddySettingKey, string> = {
  photo: 'photo',
  tenure: 'tenure',
  streak: 'streak',
  badges: 'badges',
  pet: 'pet',
  plans: 'plans',
  planTimes: 'plan_times',
  showOnCalendar: 'calendar',
  petVisits: 'pet_visits',
}

function captureChange(
  setting: string,
  value: string | boolean | undefined,
  scope: 'all' | 'buddy'
) {
  if (setting === 'badges' && typeof value === 'boolean')
    return analytics.capture('badges_setting_changed', {
      setting: 'share',
      enabled: value,
      scope,
    })
  if (setting === 'pet' && typeof value === 'boolean')
    return analytics.capture('pet_sharing_changed', { enabled: value, scope })
  analytics.capture(
    value === undefined ? 'buddies_setting_reset' : 'buddies_sharing_changed',
    {
      setting,
      scope,
      ...(typeof value === 'boolean' ? { enabled: value } : {}),
      ...(typeof value === 'string' ? { value } : {}),
    }
  )
}

export function useScopedSetting<K extends BuddySettingKey>(
  key: K
): ScopedSetting<BuddySettings[K]> {
  const { buddy, record } = useBuddySettingsScope()
  const sharing = useBuddies((state) => state.sharing)
  const buddies = useBuddies((state) => state.buddies)

  if (!buddy) {
    const previous = sharing[key]
    return {
      value: sharing[key],
      source: 'all',
      inherited: sharing[key],
      overriddenBy: buddies.flatMap((other) => {
        const value = other.overrides?.[key]
        return other.status === 'active' && value !== undefined
          ? [{ buddy: other, value: value as BuddySettings[K] }]
          : []
      }),
      set: (value) => {
        if (value === previous) return
        captureChange(SETTING_NAMES[key], value, 'all')
        record({
          inboxId: null,
          revert: () =>
            void buddiesEngine.setSharing({ [key]: previous }).catch(warn),
        })
        buddiesEngine.setSharing({ [key]: value }).catch(warn)
      },
    }
  }

  const { inboxId } = buddy
  const { settings, sources } = buddySettings(sharing, buddy)
  const previous = buddy.overrides
  const change = (value: BuddySettings[K] | undefined) => {
    captureChange(SETTING_NAMES[key], value, 'buddy')
    record({
      inboxId,
      revert: () =>
        void buddiesEngine
          .setBuddyOverrides(inboxId, () => previous)
          .catch(warn),
    })
    buddiesEngine.setBuddySetting(inboxId, key, value).catch(warn)
  }
  return {
    value: settings[key],
    source: sources[key],
    inherited: sharing[key],
    overriddenBy: [],
    set: (value) => {
      if (value === settings[key] && sources[key] === 'buddy') return
      change(value)
    },
    reset: sources[key] === 'buddy' ? () => change(undefined) : undefined,
  }
}

const ALL_ALERTS = {
  joinRequests: 'joinRequestNotifications',
  badges: 'badgeNotifications',
} as const

export function useScopedAlert(key: BuddyAlertKey): ScopedSetting<boolean> {
  const { buddy, record } = useBuddySettingsScope()
  const buddies = useBuddies((s) => s.buddies)
  const alertOverrides = useBuddies((s) => s.alertOverrides)
  const joinRequestNotifications = useBuddies((s) => s.joinRequestNotifications)
  const badgeNotifications = useBuddies((s) => s.badgeNotifications)
  const state = {
    joinRequestNotifications,
    badgeNotifications,
    alertOverrides,
  }
  const capture = (enabled: boolean | undefined, scope: 'all' | 'buddy') =>
    key === 'joinRequests'
      ? analytics.capture(
          enabled === undefined
            ? 'buddies_setting_reset'
            : 'buddy_join_request_notifications_changed',
          {
            scope,
            ...(enabled === undefined
              ? { setting: 'join_alerts' }
              : { enabled }),
          }
        )
      : analytics.capture(
          enabled === undefined
            ? 'buddies_setting_reset'
            : 'badges_setting_changed',
          enabled === undefined
            ? { setting: 'badge_alerts', scope }
            : { setting: 'alerts', enabled, scope }
        )

  if (!buddy) {
    const field = ALL_ALERTS[key]
    const previous = state[field]
    return {
      value: previous,
      source: 'all',
      inherited: previous,
      overriddenBy: buddies.flatMap((other) => {
        const value = alertOverrides[other.inboxId]?.[key]
        return other.status === 'active' && value !== undefined
          ? [{ buddy: other, value }]
          : []
      }),
      set: (value) => {
        if (value === previous) return
        capture(value, 'all')
        record({
          inboxId: null,
          revert: () => useBuddies.setState({ [field]: previous }),
        })
        useBuddies.setState({ [field]: value })
      },
    }
  }

  const { inboxId } = buddy
  const { settings, sources } = buddyAlertSettings(state, inboxId)
  const previous = alertOverrides[inboxId]
  const change = (value: boolean | undefined) => {
    capture(value, 'buddy')
    record({
      inboxId,
      revert: () => buddiesEngine.setBuddyAlerts(inboxId, () => previous),
    })
    buddiesEngine.setBuddyAlert(inboxId, key, value)
  }
  return {
    value: settings[key],
    source: sources[key],
    inherited: state[ALL_ALERTS[key]],
    overriddenBy: [],
    set: (value) => {
      if (value === settings[key] && sources[key] === 'buddy') return
      change(value)
    },
    reset: sources[key] === 'buddy' ? () => change(undefined) : undefined,
  }
}
