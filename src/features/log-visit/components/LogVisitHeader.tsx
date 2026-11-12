import { X as XIcon } from 'lucide-react-native'
import { ChevronBackwardIcon } from '@/components/ui/DirectionalIcon'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'

export default function LogVisitHeader({
  onBack,
  onClose,
}: {
  onBack?: () => void
  onClose: () => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const leading = onBack ? (
    <IconButton
      icon={ChevronBackwardIcon}
      size='xl'
      color={theme.colors.text}
      onPress={onBack}
      accessibilityLabel={i18n.t('goBack')}
    />
  ) : Platform.OS !== 'ios' ? (
    <IconButton
      icon={XIcon}
      size={20}
      color={theme.colors.text}
      onPress={onClose}
      accessibilityLabel={i18n.t('close')}
    />
  ) : null

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: Platform.select({
            android: insets.top + 12,
            default: 18,
          }),
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.side}>{leading}</View>
      <Text
        accessibilityRole='header'
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontSize: theme.fontSize('lg'),
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
        }}
      >
        {i18n.t('logVisitAction')}
      </Text>
      <View style={styles.side} />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: {
    width: 44,
    minHeight: 32,
    justifyContent: 'center',
  },
})
