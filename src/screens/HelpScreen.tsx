import React from 'react'
import { View } from 'react-native'
import Text from '../components/MyText'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import Wrapper from '../components/layout/Wrapper'
import Section from '../components/inputs/Section'
import InputRowButton from '../components/inputs/InputRowButton'
import {
  faCheckCircle,
  faChevronRight,
  faCompass,
  faPlay,
} from '@fortawesome/free-solid-svg-icons'
import IconButton from '../components/IconButton'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation } from '../types/rootStack'
import { usePreferences } from '../stores/preferences'
import { getTutorialsForPublisher } from '../constants/tutorials'
import { useTutorial } from '../stores/tutorial'
import { useTutorialContext } from '../providers/TutorialProvider'

/**
 * Help screen. Currently lists replayable tutorials; left extensible for future
 * help sections (FAQ, contact support, etc.).
 */
const HelpScreen: React.FC = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { publisher } = usePreferences()
  const { completedTutorials, setPromptSheetManuallyOpen } = useTutorial()
  const { startTutorial } = useTutorialContext()

  const tutorials = getTutorialsForPublisher(publisher)

  const isCompleted = (id: string, version: number) =>
    completedTutorials.includes(`${id}@${version}`)

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <View style={{ gap: 6 }}>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
            }}
          >
            {i18n.t('tutorial.replayTutorials')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('tutorial.replayTutorialsDescription')}
          </Text>
        </View>
        <Section>
          <InputRowButton
            leftIcon={faCompass}
            label={i18n.t('tutorial.startTour')}
            onPress={() => {
              setPromptSheetManuallyOpen(true)
              navigation.goBack()
            }}
            lastInSection
          >
            <IconButton icon={faChevronRight} />
          </InputRowButton>
        </Section>

        <Section>
          {tutorials.map((tutorial, index) => {
            const done = isCompleted(tutorial.id, tutorial.version)
            return (
              <InputRowButton
                key={tutorial.id}
                leftIcon={done ? faCheckCircle : faPlay}
                label={i18n.t(tutorial.titleKey)}
                onPress={() => {
                  startTutorial(tutorial.id)
                  navigation.goBack()
                }}
                lastInSection={index === tutorials.length - 1}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('xs'),
                      textAlign: 'right',
                    }}
                  >
                    {done
                      ? i18n.t('tutorial.completed')
                      : i18n.t('tutorial.notStarted')}
                  </Text>
                  <IconButton icon={faChevronRight} />
                </View>
              </InputRowButton>
            )
          })}
        </Section>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default HelpScreen
