import type { TakeoverKind } from '@/lib/takeover/arbiter'
import { configureTakeovers } from '@/stores/takeover'

/**
 * Who goes first when several takeovers want the screen (ADR 0021), lowest
 * first. Onboarding comes before all of them implicitly: none of their hosts is
 * mounted until it's done.
 *
 * - The update reveal and the dev-only Milestone reveal: the release itself. The
 *   launch reveal is seeded on screen in its first frame, so it never waits.
 * - What's New, then the Schedule intro: explanations, on launch or first visit.
 * - Celebrations. A streak milestone the User's own action reached plays on its
 *   own. A badge's or a pet item's moment plays when the User taps its unlock
 *   toast or tray item (ADR 0034); those toasts wait while any takeover shows.
 * - Last, the badges welcome and the history summary: news about the past, which
 *   can wait for a quiet moment.
 */
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

/**
 * The pause between two takeovers, and after whatever held the screen goes
 * away: long enough for a sheet or the profile overlay to finish closing, so
 * one moment never lands on top of another's exit.
 */
export const TAKEOVER_GAP_MS = 700

configureTakeovers({ priorities: TAKEOVER_PRIORITY, gapMs: TAKEOVER_GAP_MS })
