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

export const isRecordingBadges = () => recording

export type BadgeEvaluationResult = {
  evaluation: BadgeEvaluation
  newlyEarned: NewlyEarnedBadge[]
}

export const runBadgeEvaluation = ({
  quiet = false,
  afterOnboarding = false,
  now = new Date(),
  action = null,
}: {
  quiet?: boolean

  afterOnboarding?: boolean
  now?: Date

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

      if (firstPass) prefs.markBadgesSeen()
    } finally {
      recording = false
    }
  }

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
