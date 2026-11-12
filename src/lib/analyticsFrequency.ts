import { MMKV } from 'react-native-mmkv'
import { logger } from '@/lib/logger'

const dailyEvents = new Set([
  'Application Became Active',
  '$screen',
  '$feature_flag_called',
  'buddies_push_registration',
  'supporter_nudge_viewed',
  'backup_reminder_viewed',
  'pointer_hover_detected',
  'account_backup_failed',
  'account_session_failed',
  'device_storage_full',
  'web_storage_failed',
  'help_center_refreshed',
  'shared_car_sync_failed',
  'cloud_sync_photos_storage_full',
  'cloud_sync_photo_transfer_failed',
])
const weeklyEvents = new Set([
  'app_launch_timed',
  'onboarding_checklist_viewed',
])
const WEEK_DAYS = 7
const sessionEvents = new Set([
  'pet_room_changed',
  'timer_action_completed',
  'buddies_opened',
  'badges_opened',
  'buddy_badges_opened',
  'buddy_pet_room_viewed',
  'contacts_filter_added',
  'contacts_staleness_chip_applied',
  'map_group_opened',
  'map_unavailable',
  'contacts_suggested_contact_opened',
  'icloud_restore_probe_result',
  'saved_view_applied',
  'schedule_year_view_opened',
  'recovery_key_viewed',
  'account_activity_viewed',
  'account_devices_viewed',
  'update_required_shown',
  'web_update_prompted',
  'web_install_banner_shown',
  'help_center_search_completed',
  'settings_search_completed',
  'notification_settings_opened',
  'mileage_person_filter_used',
])

let storage: MMKV | undefined
let day: string | undefined
let daily = new Set<string>()
let weekly: Record<string, string> | undefined
let session: string | undefined
const sessionSeen = new Set<string>()

function frequencyStorage(): MMKV {
  return (storage ??= new MMKV({ id: 'analytics-frequency' }))
}

export function allowAnalyticsFrequency(
  event: string,
  properties: Record<string, unknown> = {}
): boolean {
  if (
    !dailyEvents.has(event) &&
    !weeklyEvents.has(event) &&
    !sessionEvents.has(event)
  )
    return true

  const key = JSON.stringify([
    event,
    properties.source ?? null,
    properties.variant ?? null,
    properties.status ?? null,
    properties.outcome ?? null,
    properties.reason ?? null,
    properties.$feature_flag ?? null,
    properties.$feature_flag_response ?? null,
    properties.$screen_name ?? null,
    properties.from ?? null,
    properties.part ?? null,
  ])

  if (sessionEvents.has(event)) {
    const nextSession = properties.$session_id as string | undefined
    if (nextSession !== session) {
      session = nextSession
      sessionSeen.clear()
    }
    if (sessionSeen.has(key)) return false
    sessionSeen.add(key)
    return true
  }

  const today = new Date().toISOString().slice(0, 10)
  if (weeklyEvents.has(event)) return allowWeekly(key, today)
  return allowDaily(key, today)
}

function allowDaily(
  key: string,
  today = new Date().toISOString().slice(0, 10)
): boolean {
  if (day !== today) {
    day = today
    daily = new Set()
    try {
      const saved = JSON.parse(
        frequencyStorage().getString('daily') ?? 'null'
      ) as { day?: unknown; events?: unknown } | null
      if (
        saved?.day === today &&
        Array.isArray(saved.events) &&
        saved.events.every((item) => typeof item === 'string')
      )
        daily = new Set(saved.events)
    } catch {
      logger.debug('[Analytics] Frequency storage unavailable')
    }
  }
  if (daily.has(key)) return false
  daily.add(key)
  try {
    frequencyStorage().set(
      'daily',
      JSON.stringify({ day: today, events: [...daily] })
    )
  } catch {
    logger.debug('[Analytics] Frequency state could not be persisted')
  }
  return true
}

export function allowExceptionFrequency(
  properties: Record<string, unknown> = {}
): boolean {
  if (properties.$exception_level === 'fatal') return true
  const list = properties.$exception_list
  const first: unknown = Array.isArray(list) ? list[0] : undefined
  if (first === null || typeof first !== 'object') return true
  const { type, value } = first as { type?: unknown; value?: unknown }
  return allowDaily(
    JSON.stringify([
      '$exception',
      typeof type === 'string' ? type : null,
      typeof value === 'string' ? value.slice(0, 120) : null,
    ])
  )
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}

function allowWeekly(key: string, today: string): boolean {
  if (!weekly) {
    weekly = {}
    try {
      const saved = JSON.parse(
        frequencyStorage().getString('weekly') ?? 'null'
      ) as unknown
      if (saved !== null && typeof saved === 'object' && !Array.isArray(saved))
        for (const [savedKey, sent] of Object.entries(saved))
          if (typeof sent === 'string') weekly[savedKey] = sent
    } catch {
      logger.debug('[Analytics] Frequency storage unavailable')
    }
  }
  const sent = weekly[key]
  if (sent !== undefined) {
    const age = daysBetween(sent, today)
    if (age >= 0 && age < WEEK_DAYS) return false
  }
  weekly[key] = today
  try {
    frequencyStorage().set('weekly', JSON.stringify(weekly))
  } catch {
    logger.debug('[Analytics] Frequency state could not be persisted')
  }
  return true
}

export function resetAnalyticsFrequency(): void {
  day = undefined
  daily.clear()
  weekly = undefined
  session = undefined
  sessionSeen.clear()
  try {
    frequencyStorage().delete('daily')
    frequencyStorage().delete('weekly')
  } catch {
    logger.debug('[Analytics] Frequency state could not be cleared')
  }
}
