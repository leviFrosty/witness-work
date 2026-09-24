import { useCallback, useState } from 'react'
import { RefreshControl } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useFocusEffect } from '@react-navigation/native'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import BuddiesList from '@/features/buddies/components/BuddiesList'
import BuddiesNameSection from '@/features/buddies/components/BuddiesNameSection'
import BuddiesNotificationsCard from '@/features/buddies/components/BuddiesNotificationsCard'
import BuddiesPrivacySection from '@/features/buddies/components/BuddiesPrivacySection'
import BuddyRequestCard from '@/features/buddies/components/BuddyRequestCard'
import HaveInviteSection from '@/features/buddies/components/HaveInviteSection'
import InviteBuddyCard from '@/features/buddies/components/InviteBuddyCard'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesScreen() {
  const theme = useTheme()
  const incomingClaims = useBuddies((state) => state.incomingClaims)
  const hasInbox = useBuddies((state) => state.registeredInboxId !== null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = async () => {
    setRefreshing(true)
    await buddiesEngine.sync().catch(() => {})
    setRefreshing(false)
  }

  useFocusEffect(
    useCallback(() => {
      // Only sync once the User has started using Buddies; opening the screen
      // alone creates no relay state.
      if (hasInbox) void buddiesEngine.sync().catch(() => {})
    }, [hasInbox])
  )

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 20, padding: 15, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <Card>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('buddies_intro')}
          </Text>
        </Card>
        {incomingClaims.map((claim) => (
          <BuddyRequestCard key={claim.inviteId} claim={claim} />
        ))}
        <BuddiesNameSection />
        <BuddiesList />
        <InviteBuddyCard />
        <HaveInviteSection />
        <BuddiesNotificationsCard />
        <BuddiesPrivacySection />
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}
