import { Check as CheckIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type useAskToJoin from '@/features/buddies/hooks/useAskToJoin'
import type { BuddyCardDay } from '@/features/buddies/lib/schemas'
import type { Buddy } from '@/features/buddies/lib/state'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'

/**
 * Ask to Join for one of a buddy's Plans, then Asked (tap to withdraw). Nothing
 * once they've invited this User that day or the Plan is about to start.
 */
export default function AskToJoinButton({
  buddy,
  d,
  plan,
  label,
  askToJoin,
}: {
  buddy: Buddy
  d: string
  plan: BuddyCardDay['p'][number]
  /** The Plan as read aloud, e.g. "Thu, Oct 8, 9:00 AM · 2 Hrs". */
  label: string
  askToJoin: ReturnType<typeof useAskToJoin>
}) {
  const theme = useTheme()
  const status = askToJoin.status(buddy, d, plan)
  if (status.kind === 'none') return null

  const asked = status.kind === 'asked'
  return (
    <Button
      variant='outline'
      onPress={() =>
        status.kind === 'asked'
          ? askToJoin.withdraw(buddy, status.request.id)
          : askToJoin.ask(buddy, d, plan, status.expiresAt)
      }
      accessibilityLabel={i18n.t(
        asked ? 'buddies_askedToJoinA11y' : 'buddies_askToJoinA11y',
        { name: buddyDisplayName(buddy), plan: label }
      )}
      style={{
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: theme.numbers.borderRadiusLg,
        borderColor: asked ? theme.colors.border : theme.colors.accent,
      }}
    >
      <XView style={{ gap: 4 }}>
        {asked ? (
          <LucideIcon icon={CheckIcon} size={13} color={theme.colors.textAlt} />
        ) : null}
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: asked ? theme.colors.textAlt : theme.colors.accent,
          }}
        >
          {i18n.t(asked ? 'buddies_askedToJoin' : 'buddies_askToJoin')}
        </Text>
      </XView>
    </Button>
  )
}
