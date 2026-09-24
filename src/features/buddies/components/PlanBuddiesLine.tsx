import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { DayPlan } from '@/types/timeEntry'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import useShareReplies from '@/features/buddies/hooks/useShareReplies'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import { planShareKey } from '@/features/buddies/lib/shares'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Who a Plan is with: the buddies it invites (and their answers), or the buddy
 * whose Plan it follows.
 */
export default function PlanBuddiesLine({ plan }: { plan: DayPlan }) {
  const theme = useTheme()
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const replies = useShareReplies(
    plan.buddies?.length ? planShareKey(plan.id) : undefined
  )
  if (!enabled) return null

  const people = plan.buddyShare
    ? buddies
        .filter((buddy) => buddy.inboxId === plan.buddyShare?.from)
        .map((buddy) => ({ buddy, status: undefined }))
    : buddies
        .filter((buddy) => plan.buddies?.includes(buddy.inboxId))
        .map((buddy) => {
          const reply = replies?.[buddy.inboxId]
          return {
            buddy,
            status: reply
              ? i18n.t(
                  reply.status === 'going'
                    ? 'buddies_replyGoing'
                    : 'buddies_replyDeclined'
                )
              : i18n.t('buddies_replyInvited'),
          }
        })
  if (people.length === 0) return null

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {people.map(({ buddy, status }) => (
        <XView key={buddy.inboxId} style={{ gap: 5 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: buddyColor(theme, buddy.colorIndex),
            }}
          />
          <Text style={{ fontSize: theme.fontSize('sm') }}>
            {plan.buddyShare
              ? i18n.t('buddies_withName', { name: buddy.name })
              : buddy.name}
          </Text>
          {status ? (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {status}
            </Text>
          ) : null}
        </XView>
      ))}
    </View>
  )
}
