import { X as XIcon } from 'lucide-react-native'
import type { PropsWithChildren, ReactNode } from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function SortFilterSheet({
  resultCount,
  canReset,
  onReset,
  onClose,
  overlay,
  children,
}: PropsWithChildren<{
  resultCount: number
  canReset: boolean
  onReset: () => void
  onClose: () => void

  overlay?: ReactNode
}>) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,

          paddingTop: Platform.select({
            android: insets.top + 12,
            default: 20,
          }),
          paddingBottom: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('xl'),
            color: theme.colors.text,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('contacts_sortAndFilter_title')}
        </Text>
        <IconButton
          onPress={onClose}
          size={20}
          icon={XIcon}
          color={theme.colors.text}
        />
      </View>

      {}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: 120 + insets.bottom,
        }}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator
      >
        <View style={{ gap: 22 }}>{children}</View>
      </ScrollView>

      {}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Math.max(28, insets.bottom + 12),
          backgroundColor: theme.colors.background,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
            }}
            numberOfLines={1}
          >
            {i18n.t('contacts_sortAndFilter_resultCount', {
              count: resultCount,
            })}
          </Text>
        </View>
        <Button
          onPress={onReset}
          testID='sort-filter-reset'
          disabled={!canReset}
          noTransform
          style={{
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.numbers.borderRadiusMd,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.backgroundLighter,
            opacity: canReset ? 1 : 0.5,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.text,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('reset')}
          </Text>
        </Button>
        <Button
          onPress={onClose}
          testID='sort-filter-done'
          noTransform
          style={{
            paddingVertical: 12,
            paddingHorizontal: 22,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.accent,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('md'),
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('done')}
          </Text>
        </Button>
      </View>
      {overlay}
    </View>
  )
}
