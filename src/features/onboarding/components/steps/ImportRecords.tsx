import { useContacts } from '@/stores/contactsStore'
import { useConversations } from '@/stores/conversationStore'
import { useServiceReport } from '@/stores/serviceReport'
import { analytics } from '@/lib/analytics'
import { View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useEffect, useState } from 'react'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import ImportOptions, {
  IMPORT_TYPES,
} from '@/features/onboarding/components/ImportOptions'
import Text from '@/components/ui/MyText'
import Wrapper from '@/components/ui/layout/Wrapper'
import ActionButton from '@/components/ui/ActionButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import MytimeImport from '@/features/onboarding/components/steps/MytimeImport'
import { useScribeAvailability, useScribePaperCapture } from '@/features/scribe'

interface StepProps {
  goBack: () => void
  goNext: () => void
}

const useHasImportedData = (): boolean => {
  const hasContacts = useContacts((s) => s.contacts.length > 0)
  const hasVisits = useConversations((s) => s.conversations.length > 0)
  const hasTimeEntries = useServiceReport((s) =>
    Object.values(s.serviceReports).some((months) =>
      Object.values(months).some((entries) => entries.length > 0)
    )
  )
  const hasDayPlans = useServiceReport((s) => s.dayPlans.length > 0)
  return hasContacts || hasVisits || hasTimeEntries || hasDayPlans
}

const ImportRecords = ({ goBack, goNext }: StepProps) => {
  const theme = useTheme()
  const isFocused = useIsFocused()
  const [mytime, setMytime] = useState(false)
  const scribe = useScribeAvailability()
  const paper = useScribePaperCapture()
  const paperAvailable = scribe.status !== 'hidden' && paper.available
  const hasImportedData = useHasImportedData()

  useEffect(() => {
    if (!isFocused || mytime) return
    analytics.capture('onboarding_import_options_viewed', {
      notes_available: scribe.status === 'available',
      paper_available: paperAvailable,
    })
  }, [scribe.status, paperAvailable, isFocused, mytime])

  if (mytime) {
    return (
      <MytimeImport
        goBack={() => setMytime(false)}
        goNext={() => {
          setMytime(false)
          goNext()
        }}
      />
    )
  }

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 30,
          paddingBottom: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.stepContentContainer, { marginRight: 0 }]}>
          <Text
            accessibilityRole='header'
            style={[styles.stepTitle, { fontFamily: theme.fonts.bold }]}
          >
            {i18n.t('onboardingImport_title')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t('onboardingImport_description')}
          </Text>

          <ImportOptions
            source='onboarding'
            cloud={null}
            backupRestoring={false}
            onSelect={(importType) => {
              if (importType === 'mytime') setMytime(true)
            }}
            include={IMPORT_TYPES}
          />
        </View>
      </KeyboardAwareScrollView>

      <View style={{ height: 16 }} />
      <ActionButton
        submitShortcut={false}
        onPress={() => {
          if (!hasImportedData)
            analytics.capture('onboarding_step_skipped', {
              step_id: 'importRecords',
            })
          goNext()
        }}
      >
        {hasImportedData ? i18n.t('continue') : i18n.t('skip')}
      </ActionButton>
    </Wrapper>
  )
}

export default ImportRecords
