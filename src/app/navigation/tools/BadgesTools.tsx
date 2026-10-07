import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { Award as AwardIcon } from 'lucide-react-native'
import moment from 'moment'
import { useToastController } from '@tamagui/toast'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import Text from '@/components/ui/MyText'
import Select from '@/components/ui/Select'
import Switch from '@/components/ui/Switch'
import useTheme from '@/contexts/theme'
import JsonViewer from '@/features/contacts/components/JsonViewer'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { badgeReactionEmoji } from '@/features/buddies/lib/badgeReactions'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { openNotificationsTray } from '@/app/notifications/devNotifications'
import confirmDestructive from '@/lib/confirmDestructive'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import {
  ALL_BADGE_KEYS,
  BADGE_COLLECTIONS,
  BadgeCollectionSpec,
  ONE_TIME_BADGES,
  badgeKey,
  parseBadgeKey,
} from '@/lib/badges/catalog'
import type { CollectionProgress } from '@/lib/badges/evaluate'
import {
  badgeLevelName,
  badgeName,
  badgeTitle,
  buddyCardBadges,
  earnedBadgeCount,
  isNewBadge,
} from '@/lib/badges/display'
import { useBadgeSession } from '@/stores/badgeSession'
import { noteUserAction } from '@/lib/userAction'
import { usePreferences } from '@/stores/preferences'
import {
  BADGE_LEVELS,
  BadgeArtId,
  BadgeKey,
  BadgeLevel,
  EarnedBadge,
} from '@/types/badges'
import {
  applyBadgeHistoryFixture,
  BadgeRunSummary,
  celebrateBadge,
  earnEveryBadge,
  earnRandomBadges,
  evaluateBadgesNow,
  reEarnBadgesLive,
  resetBadgeState,
  showBadgeHistorySummary,
  simulateBuddyBadge,
  simulateBuddyReaction,
} from '@/app/dev-harness/badges'
import {
  MONO,
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'

/**
 * When the session last got an evaluation. The session store keeps no time, so
 * this listens from launch (Tools is imported with the tab navigator).
 */
let lastEvaluatedAt: number | null = null
useBadgeSession.subscribe((state, previous) => {
  if (state.evaluation && state.evaluation !== previous.evaluation)
    lastEvaluatedAt = Date.now()
})

const when = (at: number | null | undefined) =>
  at ? moment(at).format('ll LTS') : '—'

const confirmDevAction = (title: string, onConfirm: () => void) =>
  confirmDestructive({
    title,
    description: 'This cannot be undone.',
    confirmLabel: i18n.t('reset'),
    onConfirm,
  })

const keyTitle = (key: BadgeKey) => {
  const parsed = parseBadgeKey(key)
  return parsed ? badgeTitle(parsed.art, parsed.level) : key
}

const describeRecord = (record: EarnedBadge, seenAt: number) =>
  [
    `stored ${moment(record.at).format('ll')}`,
    record.month ? `month ${record.month}` : null,
    record.history ? 'history' : 'live',
    isNewBadge(record, seenAt) ? 'new' : null,
  ]
    .filter(Boolean)
    .join(' · ')

/**
 * One Badge Collection: the stored level (S, from `earnedBadges`) against what
 * the latest evaluation reaches (L), and count / next threshold. Tap for each
 * level's threshold, reached month, and stored record.
 */
const CollectionRow = ({
  spec,
  earned,
  progress,
  ledgerEntries,
  seenAt,
}: {
  spec: BadgeCollectionSpec
  earned: Readonly<Record<string, EarnedBadge>>
  progress: CollectionProgress | undefined
  ledgerEntries: number
  seenAt: number
}) => {
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const stored =
    BADGE_LEVELS.filter((level) => earned[badgeKey(spec.id, level)]).at(-1) ?? 0
  const live = progress?.level ?? 0
  const shown = Math.max(stored, live) as BadgeLevel | 0
  const detailStyle = {
    fontFamily: MONO,
    fontSize: theme.fontSize('xs'),
    color: theme.colors.textAlt,
  }

  return (
    <View>
      <Pressable
        accessibilityRole='button'
        accessibilityState={{ expanded }}
        onPress={() => {
          Haptics.light()
          setExpanded(!expanded)
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 48,
          paddingVertical: 6,
          gap: 10,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <BadgeMedallion
          art={spec.id}
          level={shown || 1}
          size={28}
          state={shown ? 'earned' : 'locked'}
        />
        <Text numberOfLines={1} style={{ flexShrink: 1 }}>
          {badgeName(spec.id)}
        </Text>
        <View style={{ flex: 1, minWidth: 8 }} />
        <Text
          style={{
            fontFamily: MONO,
            fontSize: theme.fontSize('sm'),
            color: stored < live ? theme.colors.error : theme.colors.textAlt,
          }}
        >
          {`S${stored} L${live} · ${progress?.count ?? '?'}/${progress?.next ?? 'max'}`}
        </Text>
      </Pressable>
      {expanded && (
        <View style={{ paddingLeft: 38, paddingBottom: 8, gap: 4 }}>
          {BADGE_LEVELS.map((level) => {
            const record = earned[badgeKey(spec.id, level)]
            return (
              <Text key={level} selectable style={detailStyle}>
                {`${badgeLevelName(level)} ≥${spec.thresholds[level - 1]} · reached ${progress?.reachedMonths[level - 1] ?? '—'} · ${record ? describeRecord(record, seenAt) : 'not stored'}`}
              </Text>
            )
          })}
          <Text selectable style={detailStyle}>
            {`${spec.id}${spec.ledger ? ` · ledger ${ledgerEntries}` : ''}${spec.requiresBuddies ? ' · needs Buddies' : ''}`}
          </Text>
        </View>
      )}
    </View>
  )
}

type GalleryCell = {
  key: string
  level: BadgeLevel | null
  state: 'earned' | 'locked'
  label: string
}

/** Every illustration at every level, plus locked, for checking the art. */
const BadgeGallery = () => {
  const theme = useTheme()
  const lockedCell = (level: BadgeLevel | null): GalleryCell => ({
    key: 'locked',
    level,
    state: 'locked',
    label: 'Locked',
  })
  const groups: { art: BadgeArtId; cells: GalleryCell[] }[] = [
    ...BADGE_COLLECTIONS.map((spec) => ({
      art: spec.id,
      cells: [
        ...BADGE_LEVELS.map(
          (level): GalleryCell => ({
            key: `${level}`,
            level,
            state: 'earned',
            label: badgeLevelName(level),
          })
        ),
        lockedCell(1),
      ],
    })),
    ...ONE_TIME_BADGES.map((badge) => ({
      art: badge.id,
      cells: [
        { key: 'earned', level: null, state: 'earned', label: 'Earned' },
        lockedCell(null),
      ] satisfies GalleryCell[],
    })),
  ]
  const labelStyle = {
    fontSize: theme.fontSize('xs'),
    color: theme.colors.textAlt,
  }

  return (
    <View style={{ gap: 12, paddingTop: 8 }}>
      {groups.map(({ art, cells }) => (
        <View key={art} style={{ gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{ ...labelStyle, fontFamily: theme.fonts.semiBold }}
          >
            {`${badgeName(art)} · ${art}`}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cells.map((cell) => (
              <View
                key={cell.key}
                style={{ width: 64, alignItems: 'center', gap: 2 }}
              >
                <BadgeMedallion
                  art={art}
                  level={cell.level}
                  size={56}
                  state={cell.state}
                />
                <Text numberOfLines={1} style={labelStyle}>
                  {cell.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

/**
 * Badges tools: the stored and live state of every collection, evaluation and
 * celebration triggers, ways to earn or reset badges, the Buddy Card payload,
 * and a gallery of every medallion.
 */
export default function BadgesTools() {
  const toast = useToastController()
  const earnedBadges = usePreferences((s) => s.earnedBadges)
  const badgeLedger = usePreferences((s) => s.badgeLedger)
  const showBadges = usePreferences((s) => s.showBadges)
  const backfilledAt = usePreferences((s) => s.badgesBackfilledAt)
  const seenAt = usePreferences((s) => s.badgesSeenAt)
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const evaluation = useBadgeSession((s) => s.evaluation)
  const celebrations = useBadgeSession((s) => s.celebrations)
  const historyCount = useBadgeSession((s) => s.historyCount)
  const [celebrateKey, setCelebrateKey] = useState<BadgeKey>(ALL_BADGE_KEYS[0])
  const [galleryVisible, setGalleryVisible] = useState(false)
  const buddiesEnabled = useBuddiesEnabled()
  const buddiesStarted = useBuddies((s) => s.registeredInboxId !== null)
  const sharesBadges = useBuddies((s) => s.sharing.badges !== false)
  const badgeAlerts = useBuddies((s) => s.badgeNotifications)

  const say = (title: string, message = '') =>
    toast.show(title, { message, native: true })

  const reportRun = (title: string, run: BadgeRunSummary) =>
    say(
      title,
      `${run.added} new · ${run.live.length} live · ${run.history} history${
        run.added && !showBadges ? ' · not shown (Show badges off)' : ''
      }`
    )

  const records = Object.values(earnedBadges)
  const earnedCount = earnedBadgeCount(earnedBadges)
  const newCount = records.filter((r) => isNewBadge(r, seenAt)).length
  const historyRecords = records.filter((r) => r.history).length
  const buddyPayload = buddyCardBadges(earnedBadges, { dataProtectionMode })
  const sharing = showBadges && sharesBadges
  const ledgerFor = (id: string) =>
    badgeLedger.filter((entry) => entry.startsWith(`${id}:`)).length

  const celebrateOptions = ALL_BADGE_KEYS.map((key) => ({
    label: keyTitle(key),
    value: key,
  }))

  const queueThree = () => {
    const pool = [...ALL_BADGE_KEYS]
    const keys = Array.from(
      { length: 3 },
      () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
    )
    useBadgeSession.getState().celebrate(keys)
    say('Queued 3 celebrations', keys.map(keyTitle).join(', '))
  }

  return (
    <ToolSection
      title='Badges'
      icon={AwardIcon}
      summary={`${earnedCount}/${ALL_BADGE_KEYS.length} earned`}
    >
      <ToolList>
        <ToolRow
          label='Earned'
          value={`${earnedCount} / ${ALL_BADGE_KEYS.length} · ${newCount} new`}
        />
        <ToolRow
          label='Show badges'
          info='showBadges. Off hides badges everywhere, stops sharing them on the Buddy Card and skips celebrations, without forgetting them. Synced.'
          trailing={
            <Switch
              value={showBadges}
              onValueChange={(value) =>
                usePreferences.getState().setShowBadges(value)
              }
            />
          }
        />
        <ToolRow
          label='First pass'
          info='badgesBackfilledAt. Empty until this device’s first evaluation, which files everything the records reach as history. Not synced.'
          value={when(backfilledAt)}
        />
        <ToolRow
          label='Seen at'
          info='badgesSeenAt. Badges stored after it show as new. Not synced.'
          value={seenAt ? when(seenAt) : 'never'}
        />
        <ToolRow label='Ledger' value={`${badgeLedger.length} entries`} />
        <ToolRow label='Last evaluation' value={when(lastEvaluatedAt)} />
        <ToolRow
          label='Session queue'
          value={`${celebrations.length} to celebrate · ${historyCount} history`}
        />
      </ToolList>

      <ToolSubheading
        title='Evaluate'
        info='Evaluate now runs what the app runs after your own edit: newly reached badges are stored, levels reached this or last month celebrate full screen, older ones go to the history summary. As if from elsewhere is a change from iCloud Sync or a buddy: new levels skip the celebration and wait on the Home “New badge” card (ADR 0021). Quietly stores everything as history with nothing shown (what seeding uses). The app also evaluates by itself 1.5 s after records change.'
      />
      <ToolList>
        <ToolRow
          label='Evaluate now'
          onPress={() =>
            reportRun(
              'Evaluated',
              evaluateBadgesNow({ action: noteUserAction('dev') })
            )
          }
        />
        <ToolRow
          label='Evaluate as if from elsewhere'
          onPress={() =>
            reportRun('Evaluated from elsewhere', evaluateBadgesNow())
          }
        />
        <ToolRow
          label='Evaluate quietly'
          onPress={() =>
            reportRun('Evaluated quietly', evaluateBadgesNow({ quiet: true }))
          }
        />
        <ToolRow
          label='Add badge history records'
          info='Adds one contact visited monthly for 8 months, a time entry in every month since the previous service year began, a weekly plan since 3 months ago and 6 sent reports (dev-badges- ids; re-running changes nothing), then evaluates now.'
          onPress={() => {
            applyBadgeHistoryFixture()
            reportRun(
              'Badge history added',
              evaluateBadgesNow({ action: noteUserAction('dev') })
            )
          }}
        />
      </ToolList>

      <ToolSubheading
        title='Celebrate'
        info='Pushes badges straight into the session queue the celebration overlay reads, whether or not they’re earned. They wait for their takeover turn but never expire. The history summary is the sheet shown after badges are found in existing records.'
      />
      <ToolList>
        <ToolRow
          label='Badge'
          trailing={
            <Select
              data={celebrateOptions}
              value={celebrateKey}
              onChange={(item) => setCelebrateKey(item.value)}
              accessibilityLabel='Badge to celebrate'
              style={{ minWidth: 180 }}
            />
          }
        />
        <ToolRow
          label={`Celebrate ${keyTitle(celebrateKey)}`}
          onPress={() => {
            const queued = celebrateBadge(celebrateKey)
            say('Celebration queued', `${queued} in queue`)
          }}
        />
        <ToolRow label='Queue 3 celebrations' onPress={queueThree} />
        <ToolRow
          label='Show history summary'
          onPress={() => {
            const count = showBadgeHistorySummary(historyRecords || 5)
            say('History summary requested', `${count} badges`)
          }}
        />
        <ToolRow
          label='Clear session queue'
          onPress={() => {
            useBadgeSession.getState().clearCelebrations()
            useBadgeSession.getState().clearHistory()
            say('Session queue cleared')
          }}
        />
        <ToolRow
          label='Show the Home card again'
          info='badgeCardDismissed. Forgets which badges the Home “New badge” card has let go of, so it names the newest new badge again. Not synced.'
          onPress={() => {
            usePreferences.getState().set({ badgeCardDismissed: [] })
            say('Home card reset')
          }}
        />
      </ToolList>

      <ToolSubheading
        title='Earned badges'
        info='Earn every badge stores all of them as history, keeping any already earned. A random set replaces earned badges with a mixed collection where two arrived just now (new dots), plus whatever the records reach, filed quietly. Reset forgets everything; the next evaluation is a first pass again. Re-earn resets, marks the first pass done and evaluates, so levels reached this or last month celebrate.'
      />
      <ToolList>
        <ToolRow
          label='Earn every badge'
          onPress={() => say(`${earnEveryBadge()} badges earned`)}
        />
        <ToolRow
          label='Earn a random set'
          onPress={() => say(`${earnRandomBadges()} badges earned`)}
        />
        <ToolRow
          label='Mark all seen'
          onPress={() => {
            usePreferences.getState().markBadgesSeen()
            say('All badges seen')
          }}
        />
        <ToolRow
          label='Mark all unseen'
          onPress={() => {
            usePreferences.getState().set({ badgesSeenAt: 0 })
            say('All badges new')
          }}
        />
        <ToolRow
          label='Reset badges'
          tone='destructive'
          onPress={() =>
            confirmDevAction('Reset badges', () => {
              resetBadgeState()
              say('Badges reset', 'The next evaluation is a first pass')
            })
          }
        />
        <ToolRow
          label='Reset and re-earn with celebrations'
          tone='destructive'
          onPress={() =>
            confirmDevAction('Reset and re-earn badges', () =>
              reportRun(
                'Badges re-earned',
                reEarnBadgesLive(noteUserAction('dev'))
              )
            )
          }
        />
      </ToolList>

      <ToolSubheading
        title='Collections'
        info='S is the highest level stored in earnedBadges; L is what the latest evaluation reaches (red when it’s ahead of S). Count / next threshold counts months (Year Round: service years; Keeping in Touch: months with one person). Run Evaluate if L shows 0 everywhere.'
      />
      <ToolList>
        {BADGE_COLLECTIONS.map((spec) => (
          <CollectionRow
            key={spec.id}
            spec={spec}
            earned={earnedBadges}
            progress={evaluation?.collections[spec.id]}
            ledgerEntries={ledgerFor(spec.id)}
            seenAt={seenAt}
          />
        ))}
        {ONE_TIME_BADGES.map((badge) => {
          const record = earnedBadges[badgeKey(badge.id)]
          const live = evaluation?.oneTime[badge.id]
          return (
            <ToolRow
              key={badge.id}
              label={badgeName(badge.id)}
              value={`${record ? describeRecord(record, seenAt) : 'not stored'} · live ${live?.earned ? (live.month ?? 'yes') : 'no'}`}
            />
          )
        })}
      </ToolList>

      <ToolSubheading
        title='Buddy Card'
        info='What this device would publish to buddies: each collection’s highest level and every one-time badge, no counts or dates. First Bible Study stays home in data protection mode, and nothing is shared while Show badges or the Badges switch in Buddies Settings is off.'
      />
      <ToolList>
        <ToolRow
          label='Shared'
          value={
            sharing
              ? `${buddyPayload.length} badges`
              : `none (${showBadges ? 'Buddies Settings → Badges' : 'Show badges'} off)`
          }
        />
        <ToolRow
          label='Buddies Settings'
          info='The Badges sharing switch and Badge Alerts in Buddies Settings.'
          value={`sharing ${sharesBadges ? 'on' : 'off'} · alerts ${badgeAlerts ? 'on' : 'off'}`}
        />
        <ToolRow
          label='Data protection'
          value={dataProtectionMode ? 'On' : 'Off'}
        />
        <ToolRow
          label='Simulate a buddy’s new badge'
          info='Adds a “has a new badge” entry to the Home bell, from the first active buddy (their page lists the badges too) or a made-up Sample Buddy, then opens the bell. The bell lists Buddies entries only once Buddies is set up here. No push is sent.'
          disabled={!buddiesEnabled || !buddiesStarted}
          onPress={() => {
            const { name, badges } = simulateBuddyBadge()
            say(
              `${name} has a new badge`,
              badges
                .map((badge) => keyTitle(badgeKey(badge.c, badge.l)))
                .join(', ')
            )
            openNotificationsTray()
          }}
        />
        <ToolRow
          label='Simulate a reaction to my badge'
          info='Adds a random reaction from the first active buddy to your newest badge: the badge’s full-screen view lists it, and the Home bell shows “reacted to”, then opens the bell. A reaction from the same buddy to the same badge replaces the last one. With no active buddy, a made-up Sample Buddy gets only the bell entry. No push is sent.'
          disabled={!buddiesEnabled || !buddiesStarted || earnedCount === 0}
          onPress={() => {
            const {
              name,
              badgeKey: key,
              emoji,
              onBadge,
            } = simulateBuddyReaction()
            say(
              `${name} reacted ${badgeReactionEmoji(emoji)}`,
              `${keyTitle(key)}${onBadge ? '' : ' (bell only: no active buddy)'}`
            )
            openNotificationsTray()
          }}
        />
      </ToolList>
      <View style={{ paddingTop: 8 }}>
        <JsonViewer
          label='Buddy Card badges'
          value={sharing ? buddyPayload : []}
          count={sharing ? buddyPayload.length : 0}
        />
      </View>

      <ToolSubheading title='Medallions' />
      <ToolList>
        <ToolRow
          label='Show gallery'
          info='Every illustration at Bronze, Silver, Gold and Pearl plus locked, and the one-time badges, at 56 pt.'
          trailing={
            <Switch value={galleryVisible} onValueChange={setGalleryVisible} />
          }
        />
      </ToolList>
      {galleryVisible && <BadgeGallery />}

      <ToolSubheading title='Raw state' />
      <View style={{ gap: 8, paddingTop: 8 }}>
        <JsonViewer
          label='earnedBadges'
          value={earnedBadges}
          count={records.length}
        />
        <JsonViewer
          label='badgeLedger'
          value={badgeLedger}
          count={badgeLedger.length}
        />
        <JsonViewer
          label='Session evaluation'
          value={evaluation}
          count={evaluation?.earned.length ?? 0}
        />
      </View>
    </ToolSection>
  )
}
