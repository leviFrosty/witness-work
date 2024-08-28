import React from 'react'
import { View } from 'react-native'
import useTheme from '../../../contexts/theme'
import i18n from '../../../lib/locales'
import Badge from '../../Badge'
import Wrapper from '../../layout/Wrapper'
import XView from '../../layout/XView'
import Text from '../../MyText'
import CommonFeatures from './features/CommonFeatures'
import PublisherFeatures from './features/PublisherFeatures'
import { usePreferences } from '../../../stores/preferences'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import OnboardingNav from '../OnboardingNav'
import ActionButton from '../../ActionButton'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function Features(props: {
  goBack: () => void
  goNext: () => void
}) {
  const theme = useTheme()
  const { publisher } = usePreferences()
  const insets = useSafeAreaInsets()

  return (
    <Wrapper
      style={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}
    >
      <OnboardingNav goBack={props.goBack} />
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingVertical: 40,
          paddingBottom: 100,
        }}
      >
        <XView
          style={{
            alignItems: 'center',
            paddingBottom: 15,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('3xl'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('features_title')}
          </Text>
          <Badge color={theme.colors.accent} size='xs'>
            {i18n.t(publisher)}
          </Badge>
        </XView>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {publisher === 'publisher' ? <PublisherFeatures /> : null}
          <CommonFeatures />
        </View>
      </KeyboardAwareScrollView>
      <ActionButton style={{ marginHorizontal: 20 }} onPress={props.goNext}>
        {i18n.t('continue')}
      </ActionButton>
    </Wrapper>
  )
}
