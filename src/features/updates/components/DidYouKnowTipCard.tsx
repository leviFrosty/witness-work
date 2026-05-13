import { useState } from 'react'
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import useTheme from '../../../contexts/theme'
import i18n, { TranslationKey } from '../../../lib/locales'
import { usePreferences } from '../../../stores/preferences'
import { DID_YOU_KNOW_TIPS } from '../lib/didYouKnowTips'
import Text from '../../../components/MyText'

/**
 * Home-screen tip card that drip-feeds lesser-known features one at a time. On
 * mount it captures the first unseen tip and renders until dismissed; the next
 * session shows the next tip. Once the user has dismissed every entry in
 * `DID_YOU_KNOW_TIPS`, the card stops rendering for good.
 *
 * Visually quiet by design — a hairline-divider footer rather than a card — so
 * it doesn't compete with the primary home-screen content.
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
          flexDirection: 'row',
          gap: 10,
          paddingTop: 14,
          paddingBottom: 4,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View style={{ paddingTop: 2 }}>
        <FontAwesomeIcon
          icon={tip.icon}
          size={12}
          color={theme.colors.textAlt}
        />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('didYouKnow_kicker')}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
          }}
        >
          {i18n.t(`didYouKnow_${tip.id}_title` as TranslationKey)}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            color: theme.colors.textAlt,
            lineHeight: 16,
          }}
        >
          {i18n.t(`didYouKnow_${tip.id}_body` as TranslationKey)}
        </Text>
      </View>

      <Pressable
        onPress={handleDismiss}
        hitSlop={10}
        accessibilityLabel={i18n.t('gotIt')}
        style={{ padding: 2 }}
      >
        <FontAwesomeIcon
          icon={faXmark}
          size={12}
          color={theme.colors.textAlt}
        />
      </Pressable>
    </View>
  )
}

export default DidYouKnowTipCard
