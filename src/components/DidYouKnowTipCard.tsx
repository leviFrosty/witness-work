import { useState } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import useTheme from '../contexts/theme'
import i18n, { TranslationKey } from '../lib/locales'
import { usePreferences } from '../stores/preferences'
import { DID_YOU_KNOW_TIPS } from '../lib/didYouKnowTips'
import Button from './Button'
import Text from './MyText'
import XView from './layout/XView'

/**
 * Home-screen tip card that drip-feeds lesser-known features one at a time. On
 * mount it captures the first unseen tip and renders until dismissed; the next
 * session shows the next tip. Once the user has dismissed every entry in
 * `DID_YOU_KNOW_TIPS`, the card stops rendering for good.
 */
const DidYouKnowTipCard = ({ style }: { style?: StyleProp<ViewStyle> }) => {
  const theme = useTheme()
  const { seenTipIds, set } = usePreferences()
  const [dismissed, setDismissed] = useState(false)

  // Lock the chosen tip at mount so dismissal doesn't pop another card into
  // its place mid-session — the user opted into "one tip per session" pacing.
  // useState's lazy init captures the value exactly once and ignores later
  // changes to `seenTipIds`.
  const [tip] = useState(
    () => DID_YOU_KNOW_TIPS.find((t) => !seenTipIds.includes(t.id)) ?? null
  )

  if (!tip || dismissed) return null

  const handleDismiss = () => {
    set({
      seenTipIds: seenTipIds.includes(tip.id)
        ? seenTipIds
        : [...seenTipIds, tip.id],
    })
    setDismissed(true)
  }

  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.accentTranslucent,
          borderColor: theme.colors.accent,
          borderWidth: 1,
          padding: 16,
          borderRadius: theme.numbers.borderRadiusLg,
          gap: 10,
        },
        style,
      ]}
    >
      <XView style={{ gap: 8, alignItems: 'center' }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FontAwesomeIcon
            icon={tip.icon}
            size={11}
            color={theme.colors.textInverse}
          />
        </View>
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: 11,
            letterSpacing: 1.2,
          }}
        >
          {i18n.t('didYouKnow_kicker')}
        </Text>
      </XView>

      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
        }}
      >
        {i18n.t(`didYouKnow_${tip.id}_title` as TranslationKey)}
      </Text>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
          lineHeight: 19,
        }}
      >
        {i18n.t(`didYouKnow_${tip.id}_body` as TranslationKey)}
      </Text>

      <XView style={{ justifyContent: 'flex-end', marginTop: 2 }}>
        <Button
          onPress={handleDismiss}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: theme.numbers.borderRadiusMd,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('gotIt')}
          </Text>
        </Button>
      </XView>
    </View>
  )
}

export default DidYouKnowTipCard
