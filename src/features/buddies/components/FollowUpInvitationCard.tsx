import moment from 'moment'
import FollowUpCard, {
  FollowUpTopic,
  type FollowUpCardTone,
} from '@/components/FollowUpCard'
import PlanLocationLink from '@/components/PlanLocationLink'
import EmphasizedText from '@/components/ui/EmphasizedText'
import useTheme from '@/contexts/theme'
import { dayPhrase, distancePhrase, whenPhrase } from '@/lib/dayPhrases'
import i18n from '@/lib/locales'
import { atMinutesOfDay } from '@/lib/normalizeDate'
import { usePreferences } from '@/stores/preferences'
import type { IncomingShare } from '@/features/buddies/lib/state'

export default function FollowUpInvitationCard({
  share,
  buddyName,
  now,
}: {
  share: IncomingShare
  buddyName: string
  now: number
}) {
  const theme = useTheme()
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const { details } = share
  const start = atMinutesOfDay(
    moment(details.d, 'YYYY-MM-DD'),
    details.s ?? 0
  ).toDate()
  const when =
    details.s === undefined ? dayPhrase(start, now) : whenPhrase(start, now)
  const name = dataProtectionMode ? undefined : details.firstName
  const going = share.status === 'going'

  const tone: FollowUpCardTone = start.getTime() > now ? 'planned' : 'quiet'
  const key = going
    ? name
      ? 'buddies_followUpJoinHeadline'
      : 'buddies_followUpJoinHeadlineNoName'
    : name
      ? 'buddies_followUpInviteHeadline'
      : 'buddies_followUpInviteHeadlineNoName'

  return (
    <FollowUpCard
      tone={tone}
      pill={tone === 'quiet' ? undefined : distancePhrase(start, now)}
    >
      <EmphasizedText
        translate={(values) => i18n.t(key, values)}
        values={{ buddy: buddyName, ...(name ? { name } : {}), when }}
        emphasis={{ fontFamily: theme.fonts.bold }}
        style={{ fontSize: theme.fontSize('xl'), lineHeight: 26 }}
      />
      {details.topic && !dataProtectionMode ? (
        <FollowUpTopic topic={details.topic} tone={tone} />
      ) : null}
      {details.location && !dataProtectionMode ? (
        <PlanLocationLink location={details.location} />
      ) : null}
    </FollowUpCard>
  )
}
