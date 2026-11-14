import { GroupedList } from '@/components/ui/GroupedList'
import TabOrderPreferencesSection from '@/features/settings/preferences/home-and-layout/TabOrderPreferencesSection'

const PreferencesTabOrderScreen = () => (
  <GroupedList editing>
    <TabOrderPreferencesSection />
  </GroupedList>
)

export default PreferencesTabOrderScreen
