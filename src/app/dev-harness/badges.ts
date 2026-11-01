import { showBadgeUnlockToasts } from '@/features/badges/lib/badgeToasts'
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

export type BadgeRunSummary = {
  added: number

  live: BadgeKey[]

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

export const recentUserAction = (): UserAction | null =>
  userActedWithin(CELEBRATION_WINDOW_MS) ? lastUserAction() : null

export const evaluateBadgesNow = ({
  quiet = false,
  action = null,
}: { quiet?: boolean; action?: UserAction | null } = {}): BadgeRunSummary =>
  summarize(runBadgeEvaluation({ quiet, action }))

export const resetBadgeState = () => {
  usePreferences.getState().resetBadges()
  useBadgeSession.getState().reset()
}

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

export const earnEveryBadge = () => {
  record(buildEveryBadgeRecords({ now: new Date() }))
  return earnedBadgeCount(usePreferences.getState().earnedBadges)
}

export const earnRandomBadges = () => {
  const now = Date.now()
  resetBadgeState()
  record(buildRandomBadgeRecords({ now: new Date(now) }))
  runBadgeEvaluation({ quiet: true, now: new Date(now - 2000) })
  usePreferences.getState().set({ badgesSeenAt: now - 1000 })
  return earnedBadgeCount(usePreferences.getState().earnedBadges)
}

export const celebrateBadge = (key: string) => {
  if (!parseBadgeKey(key)) throw new Error(`Unknown badge key "${key}"`)
  useBadgeSession.getState().celebrate([key as BadgeKey])
  return useBadgeSession.getState().celebrations.length
}

export const offerBadge = (key: string) => {
  if (!parseBadgeKey(key)) throw new Error(`Unknown badge key "${key}"`)
  if (!usePreferences.getState().earnedBadges[key])
    record([{ key: key as BadgeKey, record: { at: Date.now() } }])
  const action = recentUserAction()
  if (action) {
    showBadgeUnlockToasts([key as BadgeKey], celebrationClaim(action).expiresAt)
    return { shown: 'toast' as const, after: action.kind }
  }
  return { shown: 'tray' as const, tray: badgeHarnessState().tray }
}

export const showBadgeHistorySummary = (count: number) => {
  useBadgeSession.getState().addHistory(count)
  return useBadgeSession.getState().historyCount
}

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
  fixture.recurringPlans.forEach((plan) => reports.addRecurringPlan(plan))
  const { submittedReportMonths, set } = usePreferences.getState()
  set({
    submittedReportMonths: [
      ...new Set([...submittedReportMonths, ...fixture.submittedReportMonths]),
    ]
      .sort()
      .slice(-24),
  })
  return fixture
}

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

    onBadge: !!buddy,
    listed: state.registeredInboxId !== null && !!buddy,
  }
}

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

    celebrationExpiresInMs: session.claim
      ? session.claim.expiresAt - Date.now()
      : null,
    historyCount: session.historyCount,
    welcome: preferences.badgesWelcome,

    tray: homeCardBadges({
      earned: preferences.earnedBadges,
      seenAt: preferences.badgesSeenAt,
      dismissed: preferences.badgeCardDismissed,
      waiting: session.celebrations,
      now: Date.now(),
    }),
    cardDismissed: [...preferences.badgeCardDismissed],

    takeover: useTakeover.getState().arbiter.active?.kind ?? null,
    evaluated: session.evaluation !== null,
  }
}
