import { MMKV } from 'react-native-mmkv'
import { logger } from '@/lib/logger'

// Reach, not repeat views. Keep locked-feature placement impressions outside
// these caps: their visit identifier links the Supporter conversion funnel.
const dailyEvents = new Set([
  'Application Became Active',
  'app_launch_timed',
  '$feature_flag_called',
  'onboarding_checklist_viewed',
  'supporter_nudge_viewed',
  'backup_reminder_viewed',
  'pointer_hover_detected',
])
const sessionEvents = new Set([
  'timer_action_completed',
  'buddies_opened',
  'badges_opened',
  'contacts_staleness_chip_applied',
  'buddies_push_registration',
  'icloud_restore_probe_result',
  'saved_view_applied',
  'schedule_year_view_opened',
])

let storage: MMKV | undefined
let day: string | undefined
let daily = new Set<string>()
let session: string | undefined
const sessionSeen = new Set<string>()

function frequencyStorage(): MMKV {
  // Independent of preferences/storage orchestration: importing those would
  // introduce a cycle through the provider. No IDs or payloads are persisted.
  return (storage ??= new MMKV({ id: 'analytics-frequency' }))
}

export function allowAnalyticsFrequency(
  event: string,
  properties: Record<string, unknown> = {}
): boolean {
  if (!dailyEvents.has(event) && !sessionEvents.has(event)) return true
  // These fields are bounded structural context. Different surfaces/variants
  // and probe/registration outcomes must still get their first observation.
  const key = JSON.stringify([
    event,
    properties.source ?? null,
    properties.variant ?? null,
    properties.status ?? null,
    properties.outcome ?? null,
    properties.reason ?? null,
    properties.$feature_flag ?? null,
    properties.$feature_flag_response ?? null,
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
    // Keep the in-memory cap when native storage is temporarily unavailable.
    logger.debug('[Analytics] Frequency state could not be persisted')
  }
  return true
}

export function resetAnalyticsFrequency(): void {
  day = undefined
  daily.clear()
  session = undefined
  sessionSeen.clear()
  try {
    frequencyStorage().delete('daily')
  } catch {
    logger.debug('[Analytics] Frequency state could not be cleared')
  }
}
