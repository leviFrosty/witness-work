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
 * - Celebrations of the User's own action. One action gets one celebration: both
 *   share the action's group, so whichever is granted first wins and the other
 *   goes quiet. The streak ranks ahead because its quiet version is only a chip
 *   flare, while a badge left over keeps its Home card and stays New on the
 *   profile. A streak milestone that comes after its action's badge card is
 *   already showing flares the chip instead.
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
