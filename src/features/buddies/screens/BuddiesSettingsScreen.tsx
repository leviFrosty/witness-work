import { ScrollView } from 'react-native'
import Wrapper from '@/components/ui/layout/Wrapper'
import BuddiesDeleteDataButton from '@/features/buddies/components/BuddiesDeleteDataButton'
import BuddiesNotificationsSection from '@/features/buddies/components/BuddiesNotificationsSection'
import BuddiesSharingSection from '@/features/buddies/components/BuddiesSharingSection'

/** What buddies see, Buddies notifications here, and deleting everything. */
export default function BuddiesSettingsScreen() {
  return (
    <Wrapper insets='bottom' style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          gap: 24,
          paddingVertical: 24,
          paddingHorizontal: 15,
          width: '100%',
          maxWidth: 720,
          alignSelf: 'center',
        }}
      >
        <BuddiesSharingSection />
        <BuddiesNotificationsSection />
        <BuddiesDeleteDataButton />
      </ScrollView>
    </Wrapper>
  )
}
