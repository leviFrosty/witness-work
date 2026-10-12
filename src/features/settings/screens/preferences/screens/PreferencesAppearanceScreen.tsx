import { GroupedList } from '@/components/ui/GroupedList'
import AppearancePreferencesSection from '@/features/settings/components/preferences-sections/AppearancePreferencesSection'

const PreferencesAppearanceScreen = () => {
  return (
    <GroupedList>
      <AppearancePreferencesSection />
    </GroupedList>
  )
}

export default PreferencesAppearanceScreen
