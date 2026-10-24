import { useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { GroupedList } from '@/components/ui/GroupedList'
import i18n from '@/lib/locales'
import PreferencesSection from '@/features/settings/components/sections/Preferences'
import AppSection from '@/features/settings/components/sections/App'
import ScribeSection from '@/features/settings/components/sections/Scribe'
import ContactSection from '@/features/settings/components/sections/Contact'
import AboutSection from '@/features/settings/components/sections/About'
import AdvancedSection from '@/features/settings/components/sections/Advanced'
import SupportSection from '@/features/settings/components/sections/Support'
import ManageSubscriptionSheet from '@/features/supporter/components/ManageSubscriptionSheet'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

type Props = {
  /** Opens destinations somewhere other than the root stack (the split pane). */
  onNavigate?: (destination: keyof RootStackParamList) => void
  selectedDestination?: keyof RootStackParamList
}

/** The same settings destinations in the compact screen and wide workspace. */
export default function SettingsContents({
  onNavigate,
  selectedDestination,
}: Props) {
  const navigation = useNavigation<RootStackNavigation>()
  // The sheet is React Native content, so it renders beside the native list.
  const [manageSubscriptionOpen, setManageSubscriptionOpen] = useState(false)
  const handleNavigate = (destination: keyof RootStackParamList) => {
    if (onNavigate) return onNavigate(destination)
    // These sections supply settings destinations that take no required params.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigation.navigate(destination as any)
  }

  const sectionProps = { handleNavigate, selectedDestination }

  return (
    <>
      <GroupedList title={i18n.t('settings')}>
        <PreferencesSection {...sectionProps} />
        <AppSection {...sectionProps} />
        <ScribeSection {...sectionProps} />
        <SupportSection
          {...sectionProps}
          onManageSubscription={() => setManageSubscriptionOpen(true)}
        />
        <ContactSection {...sectionProps} />
        <AboutSection {...sectionProps} />
        <AdvancedSection />
      </GroupedList>
      <ManageSubscriptionSheet
        open={manageSubscriptionOpen}
        setOpen={setManageSubscriptionOpen}
        source='settings'
      />
    </>
  )
}
