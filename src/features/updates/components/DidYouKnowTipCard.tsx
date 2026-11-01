import { X as XIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import { useState } from 'react'
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { DID_YOU_KNOW_TIPS } from '@/features/updates/lib/didYouKnowTips'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import { useShallow } from 'zustand/react/shallow'

const DidYouKnowTipCard = ({ style }: { style?: StyleProp<ViewStyle> }) => {
  const theme = useTheme()
  const { seenTipIds, set } = usePreferences(
    useShallow((s) => ({ seenTipIds: s.seenTipIds, set: s.set }))
  )
  const [dismissed, setDismissed] = useState(false)

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
      {}
      <HomeSectionMenu
        style={{ flex: 1 }}
        actions={[
          {
            id: 'dismiss_tip',
            title: i18n.t('dismissTip'),
            systemImage: 'xmark',
            onPress: handleDismiss,
          },
        ]}
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ paddingTop: 2 }}>
            <LucideIcon
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
        </View>
      </HomeSectionMenu>

      <PointerHover effect='highlight'>
        <Pressable
          onPress={handleDismiss}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('gotIt')}
          style={{ ...touchTargetFrame(16), borderRadius: 999 }}
        >
          <LucideIcon icon={XIcon} size={12} color={theme.colors.textAlt} />
        </Pressable>
      </PointerHover>
    </View>
  )
}

export default DidYouKnowTipCard
