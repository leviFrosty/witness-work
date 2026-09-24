import { View } from 'react-native'
import { Users as UsersIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import BuddyRequestRow from '@/features/buddies/components/BuddyRequestRow'
import BuddyRow from '@/features/buddies/components/BuddyRow'
import PendingInviteRow from '@/features/buddies/components/PendingInviteRow'
import { MAX_BUDDIES } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/**
 * Requests that need my OK first, then buddies, then requests I'm waiting on,
 * then unused invite links. Empty sections are hidden.
 */
export default function BuddiesList({ onInvite }: { onInvite: () => void }) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const incomingClaims = useBuddies((state) => state.incomingClaims)
  const buddies = useBuddies((state) => state.buddies)
  const outgoingInvites = useBuddies((state) => state.outgoingInvites)
  const active = buddies.filter((buddy) => buddy.status === 'active')
  const waiting = buddies.filter((buddy) => buddy.status !== 'active')

  if (
    buddies.length === 0 &&
    incomingClaims.length === 0 &&
    outgoingInvites.length === 0
  ) {
    return (
      <Empty
        dashedOutline
        icon={
          <LucideIcon icon={UsersIcon} size={40} color={theme.colors.text} />
        }
        title={i18n.t('buddies_emptyTitle')}
        description={i18n.t('buddies_emptyBody')}
        action={
          <View style={{ gap: 12, alignItems: 'center' }}>
            <ActionButton onPress={onInvite}>
              {i18n.t('buddies_invite')}
            </ActionButton>
            <Button
              onPress={() =>
                navigation.navigate('Buddy Code', { mode: 'scan' })
              }
            >
              <Text style={{ color: theme.colors.accent }}>
                {i18n.t('buddies_scanCode')}
              </Text>
            </Button>
          </View>
        }
      />
    )
  }

  return (
    <View style={{ gap: 24 }}>
      {incomingClaims.length > 0 && (
        <BuddiesSection title={i18n.t('buddies_requestsSection')}>
          {incomingClaims.map((claim, index) => (
            <BuddyRequestRow
              key={claim.inviteId}
              claim={claim}
              last={index === incomingClaims.length - 1}
            />
          ))}
        </BuddiesSection>
      )}
      {active.length > 0 && (
        <BuddiesSection
          title={i18n.t('buddies_buddiesSection', {
            count: active.length,
            max: MAX_BUDDIES,
          })}
        >
          {active.map((buddy, index) => (
            <BuddyRow
              key={buddy.inboxId}
              buddy={buddy}
              last={index === active.length - 1}
            />
          ))}
        </BuddiesSection>
      )}
      {waiting.length > 0 && (
        <BuddiesSection title={i18n.t('buddies_waitingSection')}>
          {waiting.map((buddy, index) => (
            <BuddyRow
              key={buddy.inboxId}
              buddy={buddy}
              last={index === waiting.length - 1}
            />
          ))}
        </BuddiesSection>
      )}
      {outgoingInvites.length > 0 && (
        <BuddiesSection
          title={i18n.t('buddies_invitesSection')}
          footer={i18n.t('buddies_invitesFooter')}
        >
          {outgoingInvites.map((invite, index) => (
            <PendingInviteRow
              key={invite.inviteId}
              invite={invite}
              last={index === outgoingInvites.length - 1}
            />
          ))}
        </BuddiesSection>
      )}
    </View>
  )
}
