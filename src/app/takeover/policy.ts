import type { TakeoverKind } from '@/lib/takeover/arbiter'
import { configureTakeovers } from '@/stores/takeover'

export const TAKEOVER_PRIORITY: Record<TakeoverKind, number> = {
  'update-reveal': 10,
  'milestone-reveal': 11,
  'whats-new': 20,
  'schedule-intro': 30,
  'streak-celebration': 40,
  'badge-celebration': 41,
  'pet-unlock': 42,
  'badges-welcome': 50,
  'badges-history': 51,
}

export const TAKEOVER_GAP_MS = 700

configureTakeovers({ priorities: TAKEOVER_PRIORITY, gapMs: TAKEOVER_GAP_MS })
