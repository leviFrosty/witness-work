import React, { useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Sheet } from 'tamagui'
import Text from '../MyText'
import ActionButton from '../ActionButton'
import i18n from '../../lib/locales'
import useTheme from '../../contexts/theme'
import { useTutorial } from '../../stores/tutorial'
import { usePreferences } from '../../stores/preferences'
import { getTourSequenceForPublisher } from '../../constants/tutorials'
import { useTutorialContext } from '../../providers/TutorialProvider'

/**
 * Post-onboarding prompt offering the full tour. Renders when
 * `!hasSeenPostOnboardingPrompt` and onboarding is complete. Also re-used from
 * the Help screen if the user ever wants to re-enter the entry point.
 */
export const TutorialPromptSheet: React.FC = () => {
  const theme = useTheme()
  const { publisher, onboardingComplete } = usePreferences()
  const {
    hasSeenPostOnboardingPrompt,
    markPostOnboardingPromptSeen,
    promptSheetManuallyOpen,
    setPromptSheetManuallyOpen,
  } = useTutorial()
  const { startTutorial } = useTutorialContext()

  // Track open locally so Tamagui can drive close animations. Mirrors the
  // computed desired-open state from store values.
  const desiredOpen =
    promptSheetManuallyOpen ||
    (onboardingComplete && !hasSeenPostOnboardingPrompt)
  const [open, setOpen] = useState(false)

  React.useEffect(() => {
    setOpen(desiredOpen)
  }, [desiredOpen])

  const close = () => {
    setOpen(false)
    if (promptSheetManuallyOpen) setPromptSheetManuallyOpen(false)
  }

  const handleStart = () => {
    markPostOnboardingPromptSeen()
    close()
    // Wait for the prompt sheet's close animation to finish before the
    // tutorial mounts its own sheet. Two Tamagui sheets fighting over the
    // modal portal at the same time produces a stuck-dim visual glitch.
    const sequence = getTourSequenceForPublisher(publisher)
    const first = sequence[0]
    if (first) {
      setTimeout(() => startTutorial(first), 350)
    }
  }

  const handleSkip = () => {
    markPostOnboardingPromptSeen()
    close()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o: boolean) => {
        if (!o) handleSkip()
        else setOpen(true)
      }}
      modal
      snapPoints={[50]}
      dismissOnSnapToBottom
      animation='quick'
      zIndex={150_000}
    >
      <Sheet.Overlay zIndex={150_000 - 1} />
      <Sheet.Handle />
      <Sheet.Frame
        padding={28}
        gap={16}
        backgroundColor={theme.colors.background}
      >
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
          }}
        >
          {i18n.t('tutorial.promptTitle')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            color: theme.colors.text,
          }}
        >
          {i18n.t('tutorial.promptBody')}
        </Text>
        <View style={{ flex: 1 }} />
        <ActionButton onPress={handleStart}>
          {i18n.t('tutorial.startTour')}
        </ActionButton>
        <TouchableOpacity onPress={handleSkip} style={{ alignSelf: 'center' }}>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('md'),
              paddingVertical: 8,
            }}
          >
            {i18n.t('tutorial.skipTour')}
          </Text>
        </TouchableOpacity>
      </Sheet.Frame>
    </Sheet>
  )
}
