import {
  BadgeEvaluationResult,
  runBadgeEvaluation,
} from '@/app/badges/runBadgeEvaluation'
import {
  buildBadgeHistoryFixture,
  buildEveryBadgeRecords,
  buildRandomBadgeRecords,
  FixtureEarnedBadge,
} from '@/app/dev-fixtures/badges'
import {
  BADGE_REACTION_EMOJI,
  type BadgeReactionEmoji,
  isBadgeReactionEmoji,
} from '@/features/buddies/lib/badgeReactions'
import {
  sharedBadgeKey,
  sortedForAnnouncement,
  withNewBadges,
} from '@/features/buddies/lib/sharedBadges'
import type { BuddyNotification } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import {
  BADGE_COLLECTIONS,
  badgeKey,
  ONE_TIME_BADGES,
  parseBadgeKey,
} from '@/lib/badges/catalog'
import {
  earnedBadgeCount,
  homeCardBadges,
  profileBadges,
} from '@/lib/badges/display'
import {
  CELEBRATION_WINDOW_MS,
  celebrationClaim,
  lastUserAction,
  type UserAction,
  userActedWithin,
} from '@/lib/userAction'
import { useBadgeSession } from '@/stores/badgeSession'
import { useTakeover } from '@/stores/takeover'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import type { BadgeKey, BadgeLevel, SharedBadge } from '@/types/badges'

/**
 * Dev-only badge controls shared by Tools (`BadgesTools`) and the verification
 * harness (`__WW_DEV__.badges`). They write the real stores, so whatever they
 * set up renders exactly as earned badges would.
 */

export type BadgeRunSummary = {
  /** Badges this run stored. */
  added: number
  /** Queued for celebration (live, and badges are shown). */
  live: BadgeKey[]
  /** Filed as history. */
  history: number
}

const summarize = ({ newlyEarned }: BadgeEvaluationResult): BadgeRunSummary => {
  const live = newlyEarned.filter((badge) => badge.live)
  return {
    added: newlyEarned.length,
    live: live.map((badge) => badge.key),
    history: newlyEarned.length - live.length,
  }
}

/** The User's (or a dev's) action from the last few seconds, if any. */
export const recentUserAction = (): UserAction | null =>
  userActedWithin(CELEBRATION_WINDOW_MS) ? lastUserAction() : null

/**
 * Evaluates from the current stores, as after a change. With `action` (an
 * action the User just took), live badges celebrate full screen; without one,
 * as after a change from elsewhere, they wait on the Home "New badge" card.
 * History shows the welcome or summary either way. `quiet` stores everything as
 * history with nothing shown.
 */
export const evaluateBadgesNow = ({
  quiet = false,
  action = null,
}: { quiet?: boolean; action?: UserAction | null } = {}): BadgeRunSummary =>
  summarize(runBadgeEvaluation({ quiet, action }))

/**
 * Forgets earned badges, the ledger, the seen time and the session queue. The
 * next evaluation is this device's first pass again: whatever the records reach
 * is filed as history, without celebrations.
 */
export const resetBadgeState = () => {
  usePreferences.getState().resetBadges()
  useBadgeSession.getState().reset()
}

/**
 * Resets, then marks the first pass as done and evaluates, so what the records
 * reach counts as just earned by `action`: levels reached this or last month
 * celebrate (or, without an action, wait on the Home card); older ones still go
 * to the history summary.
 */
export const reEarnBadgesLive = (
  action: UserAction | null = null
): BadgeRunSummary => {
  resetBadgeState()
  usePreferences
    .getState()
    .recordBadges({ earned: [], ledger: [], backfilledAt: Date.now() })
  return evaluateBadgesNow({ action })
}

const record = (earned: FixtureEarnedBadge[]) =>
  usePreferences.getState().recordBadges({ earned, ledger: [] })

/** Stores every badge as history. Never overwrites one already earned. */
export const earnEveryBadge = () => {
  record(buildEveryBadgeRecords({ now: new Date() }))
  return earnedBadgeCount(usePreferences.getState().earnedBadges)
}

/**
 * Replaces earned badges with a realistic mixed set; two arrive just now and
 * show as new. Whatever the records already reach is filed quietly too, a
 * moment earlier, so it stays seen and nothing pops up later.
 */
export const earnRandomBadges = () => {
  const now = Date.now()
  resetBadgeState()
  record(buildRandomBadgeRecords({ now: new Date(now) }))
  runBadgeEvaluation({ quiet: true, now: new Date(now - 2000) })
  usePreferences.getState().set({ badgesSeenAt: now - 1000 })
  return earnedBadgeCount(usePreferences.getState().earnedBadges)
}

/**
 * Queues one badge's celebration, earned or not, for a preview: it waits for
 * its takeover turn but never expires (Developer Tools' Celebrate buttons).
 */
export const celebrateBadge = (key: string) => {
  if (!parseBadgeKey(key)) throw new Error(`Unknown badge key "${key}"`)
  useBadgeSession.getState().celebrate([key as BadgeKey])
  return useBadgeSession.getState().celebrations.length
}

/**
 * A badge arriving now, under the action rule (ADR 0021), for
 * `__WW_DEV__.badges.celebrate`. Right after an action (`noteUserAction`), it
 * celebrates full screen once it gets its turn. Otherwise it arrives quietly:
 * an unearned badge is recorded as earned just now, so the Home "New badge"
 * card names it. A badge already earned quietly before (as history, say) shows
 * nothing new.
 */
export const offerBadge = (key: string) => {
  if (!parseBadgeKey(key)) throw new Error(`Unknown badge key "${key}"`)
  const action = recentUserAction()
  if (action) {
    useBadgeSession
      .getState()
      .celebrate([key as BadgeKey], celebrationClaim(action))
    return { shown: 'celebration' as const, after: action.kind }
  }
  if (!usePreferences.getState().earnedBadges[key])
    record([{ key: key as BadgeKey, record: { at: Date.now() } }])
  return { shown: 'card' as const, card: badgeHarnessState().card }
}

/** Asks for the "found in your history" summary. */
export const showBadgeHistorySummary = (count: number) => {
  useBadgeSession.getState().addHistory(count)
  return useBadgeSession.getState().historyCount
}

/**
 * Writes the badge history fixture (one Contact visited monthly, a year and a
 * bit of shared months, a weekly Plan, sent reports). Upserts by id, so running
 * it again changes nothing. Doesn't evaluate.
 */
export const applyBadgeHistoryFixture = (now = new Date()) => {
  const fixture = buildBadgeHistoryFixture({ now })
  for (const contact of fixture.contacts) {
    if (useContacts.getState().deletedContacts.some((c) => c.id === contact.id))
      useContacts.getState().removeDeletedContact(contact.id)
    useContacts.getState().addContact(contact)
  }
  fixture.visits.forEach(useConversations.getState().addConversation)
  const reports = useServiceReport.getState()
  const existing = new Set(
    Object.values(reports.serviceReports)
      .flatMap((byMonth) => Object.values(byMonth ?? {}).flat())
      .map((entry) => entry.id)
  )
  fixture.timeEntries
    .filter((entry) => !existing.has(entry.id))
    .forEach(reports.addServiceReport)
  fixture.recurringPlans.forEach(reports.addRecurringPlan)
  const { submittedReportMonths, set } = usePreferences.getState()
  set({
    // The same 24-month cap `markReportSubmitted` keeps.
    submittedReportMonths: [
      ...new Set([...submittedReportMonths, ...fixture.submittedReportMonths]),
    ]
      .sort()
      .slice(-24),
  })
  return fixture
}

/** One or two badges a buddy might just have earned. */
const sampleBuddyBadges = (random: () => number): SharedBadge[] => {
  const pick = (): SharedBadge => {
    if (random() < 0.2) {
      const badge =
        ONE_TIME_BADGES[Math.floor(random() * ONE_TIME_BADGES.length)]
      return { c: badge.id }
    }
    const spec =
      BADGE_COLLECTIONS[Math.floor(random() * BADGE_COLLECTIONS.length)]
    return { c: spec.id, l: (1 + Math.floor(random() * 3)) as BadgeLevel }
  }
  const first = pick()
  const second = pick()
  return sortedForAnnouncement(
    random() < 0.5 || second.c === first.c ? [first] : [first, second]
  )
}

/**
 * Puts a buddy's "new badge" entry in the Home bell without a second device,
 * from the first active buddy, whose page then lists the badges too. Calling it
 * again within 20 hours folds the news into the same bell row. With no active
 * buddy the entry goes to a made-up "Sample Buddy" and the bell leaves it out,
 * as it does all news without buddies. The bell lists Buddies entries only once
 * Buddies is set up on this device.
 */
export const simulateBuddyBadge = (random = Math.random) => {
  const state = useBuddies.getState()
  const buddy = state.buddies.find((candidate) => candidate.status === 'active')
  const badges = sampleBuddyBadges(random)
  const entry: BuddyNotification = {
    id: `dev-badge-${Date.now()}`,
    kind: 'badge',
    at: Date.now(),
    read: false,
    ...(buddy ? { from: buddy.inboxId } : {}),
    name: buddy?.name ?? 'Sample Buddy',
    badges,
  }
  useBuddies.setState((current) => ({
    notifications: [entry, ...current.notifications],
    buddies: buddy
      ? current.buddies.map((candidate) =>
          candidate.inboxId === buddy.inboxId
            ? {
                ...candidate,
                badges: withNewBadges(candidate.badges ?? [], badges),
              }
            : candidate
        )
      : current.buddies,
  }))
  return {
    name: entry.name,
    badges,
    listed: state.registeredInboxId !== null && !!buddy,
  }
}

/**
 * Puts a buddy's reaction to one of this User's badges in place without a
 * second device: on that badge's view (`useBadgeReactions`) and in the Home
 * bell, from the first active buddy, replacing their earlier reaction to it.
 * With no active buddy, the entry goes to a made-up "Sample Buddy", which
 * neither the bell nor the badge view lists. The badge key defaults to the
 * newest earned badge and must be earned; `emoji` defaults to a random
 * reaction. No push is sent.
 */
export const simulateBuddyReaction = (
  requestedKey?: string,
  emoji?: string,
  random = Math.random
) => {
  const { earnedBadges } = usePreferences.getState()
  const [newest] = profileBadges(earnedBadges)
  const key =
    requestedKey ?? (newest ? badgeKey(newest.art, newest.level) : null)
  if (!key) throw new Error('No badge earned yet; try earnRandom() first')
  const parsed = parseBadgeKey(key)
  if (!parsed || !earnedBadges[key])
    throw new Error(`"${key}" isn't a badge this User has earned`)
  if (emoji !== undefined && !isBadgeReactionEmoji(emoji))
    throw new Error(
      `Unknown reaction "${emoji}"; use one of ${BADGE_REACTION_EMOJI.map((r) => r.id).join(', ')}`
    )
  const reaction: BadgeReactionEmoji =
    emoji ??
    BADGE_REACTION_EMOJI[Math.floor(random() * BADGE_REACTION_EMOJI.length)].id
  const badge: SharedBadge = parsed.level
    ? { c: parsed.art, l: parsed.level }
    : { c: parsed.art }
  const state = useBuddies.getState()
  const buddy = state.buddies.find((candidate) => candidate.status === 'active')
  const now = Date.now()
  const entry: BuddyNotification = {
    id: `dev-badge-reaction-${now}`,
    kind: 'badgeReaction',
    at: now,
    read: false,
    ...(buddy ? { from: buddy.inboxId } : {}),
    name: buddy?.name ?? 'Sample Buddy',
    badges: [badge],
    reaction,
  }
  useBuddies.setState((current) => ({
    notifications: [
      entry,
      ...current.notifications.filter(
        (n) =>
          !(
            n.kind === 'badgeReaction' &&
            n.from === entry.from &&
            n.badges?.some((b) => sharedBadgeKey(b) === key)
          )
      ),
    ],
    badgeReactions: buddy
      ? {
          ...current.badgeReactions,
          [key]: {
            ...current.badgeReactions[key],
            [buddy.inboxId]: { e: reaction, at: now, rev: now },
          },
        }
      : current.badgeReactions,
  }))
  return {
    name: entry.name,
    badgeKey: key as BadgeKey,
    emoji: reaction,
    /** Shown on the badge's view (needs an active buddy). */
    onBadge: !!buddy,
    listed: state.registeredInboxId !== null && !!buddy,
  }
}

/** A JSON-safe snapshot for `wwv eval` and Tools. */
export const badgeHarnessState = () => {
  const preferences = usePreferences.getState()
  const session = useBadgeSession.getState()
  return {
    earned: Object.keys(preferences.earnedBadges).sort(),
    earnedCount: earnedBadgeCount(preferences.earnedBadges),
    backfilledAt: preferences.badgesBackfilledAt,
    seenAt: preferences.badgesSeenAt,
    showBadges: preferences.showBadges,
    ledger: preferences.badgeLedger.length,
    celebrations: [...session.celebrations],
    /** When the waiting celebration's moment ends (null: a preview). */
    celebrationExpiresInMs: session.claim
      ? session.claim.expiresAt - Date.now()
      : null,
    historyCount: session.historyCount,
    welcome: preferences.badgesWelcome,
    /** What the Home "New badge" card names, lead first. */
    card: homeCardBadges({
      earned: preferences.earnedBadges,
      seenAt: preferences.badgesSeenAt,
      dismissed: preferences.badgeCardDismissed,
      waiting: session.celebrations,
      now: Date.now(),
    }),
    cardDismissed: [...preferences.badgeCardDismissed],
    /** The takeover on screen, if any (`__WW_DEV__.takeover.state()`). */
    takeover: useTakeover.getState().arbiter.active?.kind ?? null,
    evaluated: session.evaluation !== null,
  }
}
