import { GroupedList } from '@/components/ui/GroupedList'
import HomeScreenPreferencesSection from '@/features/settings/preferences/home-and-layout/HomeScreenPreferencesSection'

const PreferencesHomeScreen = () => (
  <GroupedList editing>
    <HomeScreenPreferencesSection />
  </GroupedList>
)

export default PreferencesHomeScreen
