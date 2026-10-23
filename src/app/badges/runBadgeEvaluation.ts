import { showBadgeUnlockToasts } from '@/features/badges/lib/badgeToasts'
import { buddyTogetherMonths } from '@/features/buddies/lib/badgeEvidence'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { analytics } from '@/lib/analytics'
import {
  compareBadgeKeysForAnnouncement,
  parseBadgeKey,
} from '@/lib/badges/catalog'
import {
  BadgeEvaluation,
  NewlyEarnedBadge,
  evaluateBadges,
  newlyEarnedBadges,
} from '@/lib/badges/evaluate'
import { welcomeAfterEvaluation } from '@/lib/badges/welcome'
import { logger } from '@/lib/logger'
import { celebrationClaim, type UserAction } from '@/lib/userAction'
import { useBadgeSession } from '@/stores/badgeSession'
import { useConversations } from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'

let recording = false

/**
 * True while an evaluation stores its own results, so the runtime doesn't
 * schedule another evaluation in response to its own write.
 */
export const isRecordingBadges = () => recording

export type BadgeEvaluationResult = {
  evaluation: BadgeEvaluation
  newlyEarned: NewlyEarnedBadge[]
}

/**
 * Evaluates the User's badges from the current stores, stores anything newly
 * earned, and decides how each newly earned badge arrives (ADR 0021, ADR
 * 0034):
 *
 * - Earned live by `action`, something the User just did: an unlock toast, if it
 *   gets on screen while the action is recent. Tapping it opens the full-screen
 *   celebration.
 * - Earned live otherwise (iCloud Sync, the Watch or Siri, a buddy's reply, a
 *   Plan's day arriving overnight), or a toast nobody acted on: stored and new,
 *   and waiting in the notifications tray instead.
 * - Found in history: stored quietly, with the welcome or one summary.
 *
 * `quiet` files everything as history with no celebration or summary — for
 * seeding test data, where a flood of celebrations would only get in the way.
 * `afterOnboarding` files the same way for the first evaluation after the User
 * finishes onboarding: what they entered, imported or restored there is already
 * theirs, so no welcome or summary covers their first look at Home.
 */
export const runBadgeEvaluation = ({
  quiet = false,
  afterOnboarding = false,
  now = new Date(),
  action = null,
}: {
  quiet?: boolean
  /** The first evaluation since the User finished onboarding. */
  afterOnboarding?: boolean
  now?: Date
  /** The User's action behind this change; null when it came from elsewhere. */
  action?: UserAction | null
} = {}): BadgeEvaluationResult => {
  const started = Date.now()
  const prefs = usePreferences.getState()
  const { serviceReports, dayPlans, recurringPlans } =
    useServiceReport.getState()
  const visits = useConversations.getState().conversations
  const buddies = useBuddies.getState()

  const evaluation = evaluateBadges({
    now,
    serviceReports,
    dayPlans,
    recurringPlans,
    visits,
    submittedReportMonths: prefs.submittedReportMonths,
    ledger: prefs.badgeLedger,
    togetherMonths: buddyTogetherMonths({
      state: buddies,
      dayPlans,
      visits,
      now,
    }),
    hasActiveBuddy: buddies.buddies.some((buddy) => buddy.status === 'active'),
  })
  const session = useBadgeSession.getState()
  session.setEvaluation(evaluation)

  const firstPass = prefs.badgesBackfilledAt === null
  // Filed as history with nothing on screen.
  const silent = quiet || afterOnboarding
  const newlyEarned = newlyEarnedBadges({
    evaluation,
    stored: prefs.earnedBadges,
    now,
    backfill: silent || firstPass,
  })
  const live = newlyEarned
    .filter((badge) => badge.live)
    .map((badge) => badge.key)
    .sort(compareBadgeKeysForAnnouncement)
  const history = newlyEarned.filter((badge) => !badge.live)
  const welcome = welcomeAfterEvaluation({
    firstPass,
    welcome: prefs.badgesWelcome,
    quiet: silent,
    showBadges: prefs.showBadges,
    historyCount: history.length,
  })
  if (newlyEarned.length || evaluation.ledgerAdditions.length || firstPass) {
    recording = true
    try {
      prefs.recordBadges({
        earned: newlyEarned,
        ledger: evaluation.ledgerAdditions,
        backfilledAt: firstPass ? now.getTime() : undefined,
        welcome,
      })
      // What a first pass finds is summarized once, not marked new one by one.
      if (firstPass) prefs.markBadgesSeen()
    } finally {
      recording = false
    }
  }

  // Buddies hear about new levels; the engine skips it unless badges are shared.
  if (live.length && !quiet)
    void buddiesEngine
      .announceBadges(live)
      .catch((error) => logger.warn('[badges] buddies announcement', error))

  for (const key of live) {
    const parsed = parseBadgeKey(key)
    if (!parsed) continue
    analytics.capture('badge_earned', {
      badge: parsed.art,
      level: parsed.level ?? 0,
      kind: parsed.level ? 'collection' : 'one_time',
      after_action: action !== null,
    })
  }
  if (firstPass && !quiet && history.length) {
    analytics.capture('badges_history_found', { count: history.length })
  }

  if (prefs.showBadges && !silent) {
    // Without an action, live badges wait in the tray (`homeCardBadges`).
    if (live.length && action)
      showBadgeUnlockToasts(live, celebrationClaim(action).expiresAt)
    if (history.length && welcome !== 'pending')
      session.addHistory(history.length)
  }

  logger.log(
    `[badges] evaluated in ${Date.now() - started}ms: ${newlyEarned.length} new (${live.length} live${live.length ? (action ? `, after ${action.kind}` : ', quiet') : ''})`
  )
  return { evaluation, newlyEarned }
}
