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
import ScribeZeroDataRetentionSheet from '@/features/scribe/components/ScribeZeroDataRetentionSheet'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

type Props = {
  onNavigate?: (destination: keyof RootStackParamList) => void
  selectedDestination?: keyof RootStackParamList
}

export default function SettingsContents({
  onNavigate,
  selectedDestination,
}: Props) {
  const navigation = useNavigation<RootStackNavigation>()

  const [manageSubscriptionOpen, setManageSubscriptionOpen] = useState(false)
  const [zeroDataRetentionOpen, setZeroDataRetentionOpen] = useState(false)
  const handleNavigate = (destination: keyof RootStackParamList) => {
    if (onNavigate) return onNavigate(destination)

    navigation.navigate(destination as any)
  }

  const sectionProps = { handleNavigate, selectedDestination }

  return (
    <>
      <GroupedList title={i18n.t('settings')}>
        <PreferencesSection {...sectionProps} />
        <AppSection {...sectionProps} />
        <ScribeSection
          {...sectionProps}
          onZeroDataRetention={() => setZeroDataRetentionOpen(true)}
        />
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
      <ScribeZeroDataRetentionSheet
        open={zeroDataRetentionOpen}
        setOpen={setZeroDataRetentionOpen}
      />
    </>
  )
}
