import { useState } from 'react'
import { View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import {
  faFileLines,
  faFileImport,
  faCloud,
} from '@fortawesome/free-solid-svg-icons'
import { styles } from '@/features/onboarding/components/Onboarding.styles'
import OnboardingNav from '@/features/onboarding/components/OnboardingNav'
import Text from '@/components/ui/MyText'
import Card from '@/components/ui/Card'
import Wrapper from '@/components/ui/layout/Wrapper'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import MytimeImport from '@/features/onboarding/components/steps/MytimeImport'
import ICloudRestore from '@/features/onboarding/components/steps/iCloudRestore'
import NotesImportWizard from '@/features/notes-import/components/NotesImportWizard'
import * as ICloudBridge from '../../../../../modules/icloud-bridge'

interface StepProps {
  goBack: () => void
  goNext: () => void
}

type Mode = 'choose' | 'notes' | 'mytime' | 'icloud'

const OptionCard = ({
  icon,
  color,
  titleKey,
  descKey,
  disabled,
  disabledNoteKey,
  onPress,
}: {
  icon: IconProp
  color: string
  titleKey: TranslationKey
  descKey: TranslationKey
  disabled?: boolean
  disabledNoteKey?: TranslationKey
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      noTransform
      style={{ marginBottom: 10, opacity: disabled ? 0.5 : 1 }}
    >
      <Card
        flexDirection='row'
        style={{ alignItems: 'center', gap: 14, paddingVertical: 14 }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: color,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <FontAwesomeIcon
            icon={icon}
            size={18}
            color={theme.colors.textInverse}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t(titleKey)}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t(disabled && disabledNoteKey ? disabledNoteKey : descKey)}
          </Text>
        </View>
      </Card>
    </Button>
  )
}

/**
 * Onboarding "Pick up where you left off" chooser — replaces the separate
 * iCloud-restore and MyTime-import steps with one fork into Notes / MyTime /
 * iCloud (decision 9). MyTime + iCloud reuse their existing step components
 * inline; iCloud is grayed when the device has no iCloud. Notes + MyTime return
 * to the flow (`goNext`); iCloud restore completes onboarding on its own.
 */
const PickUpWhereLeftOff = ({ goBack, goNext }: StepProps) => {
  const theme = useTheme()
  const [mode, setMode] = useState<Mode>('choose')
  const toChooser = () => setMode('choose')
  const icloudAvailable = ICloudBridge.isAvailable()

  if (mode === 'mytime') {
    return <MytimeImport goBack={toChooser} goNext={goNext} />
  }
  if (mode === 'icloud') {
    return <ICloudRestore goBack={toChooser} goNext={goNext} />
  }
  if (mode === 'notes') {
    return (
      <Wrapper
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingTop: 60,
          paddingBottom: 40,
        }}
      >
        <OnboardingNav goBack={toChooser} />
        <View style={{ flex: 1, paddingTop: 20 }}>
          <NotesImportWizard publisherMode='overwrite' onComplete={goNext} />
        </View>
      </Wrapper>
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
          <Text style={styles.stepTitle}>
            {i18n.t('onboardingPickUp_title')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              marginBottom: 24,
              lineHeight: 20,
            }}
          >
            {i18n.t('onboardingPickUp_description')}
          </Text>

          <OptionCard
            icon={faFileLines}
            color={theme.colors.cyan}
            titleKey='onboardingPickUp_notes'
            descKey='onboardingPickUp_notesDesc'
            onPress={() => setMode('notes')}
          />
          <OptionCard
            icon={faFileImport}
            color={theme.colors.indigo}
            titleKey='onboardingPickUp_mytime'
            descKey='onboardingPickUp_mytimeDesc'
            onPress={() => setMode('mytime')}
          />
          <OptionCard
            icon={faCloud}
            color={theme.colors.purple}
            titleKey='onboardingPickUp_icloud'
            descKey='onboardingPickUp_icloudDesc'
            disabled={!icloudAvailable}
            disabledNoteKey='onboardingPickUp_icloudUnavailable'
            onPress={() => setMode('icloud')}
          />
        </View>

        <Button
          onPress={goNext}
          style={{ alignSelf: 'center', paddingVertical: 10 }}
        >
          <Text
            style={{
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('onboardingPickUp_skip')}
          </Text>
        </Button>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default PickUpWhereLeftOff
