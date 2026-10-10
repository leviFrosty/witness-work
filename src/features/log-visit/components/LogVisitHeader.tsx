import {
  ChevronLeft as ChevronLeftIcon,
  UserPlus as UserPlusIcon,
  X as XIcon,
} from 'lucide-react-native'
import { Platform, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'

/**
 * "Log Visit" over both steps. Picking: New Contact on the trailing side.
 * Choosing an outcome: a back chevron to the list. The sheet itself closes the
 * picker on iOS; Android presents it full screen, so it gets a close button
 * too.
 */
export default function LogVisitHeader({
  onBack,
  onClose,
  onNewContact,
}: {
  onBack?: () => void
  onClose: () => void
  onNewContact?: () => void
}) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const leading = onBack ? (
    <IconButton
      icon={ChevronLeftIcon}
      size='xl'
      color={theme.colors.text}
      onPress={onBack}
      accessibilityLabel={i18n.t('goBack')}
    />
  ) : Platform.OS === 'android' ? (
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
          // Android presents this modal full-screen, edge-to-edge.
          paddingTop: Platform.OS === 'android' ? insets.top + 12 : 18,
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
      <View style={[styles.side, { alignItems: 'flex-end' }]}>
        {onNewContact && (
          <PointerTooltip label={i18n.t('logVisit_newContact')} effect='none'>
            <IconButton
              icon={UserPlusIcon}
              size={22}
              color={theme.colors.text}
              onPress={onNewContact}
              accessibilityLabel={i18n.t('logVisit_newContact')}
            />
          </PointerTooltip>
        )}
      </View>
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
