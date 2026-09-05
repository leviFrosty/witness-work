import { View } from 'react-native'
import { Sheet } from 'tamagui'
import { X } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { MileageCategory } from '@/types/mileage'
import {
  mileageCategoryLabel,
  type MileageCategoryTotal,
} from '@/features/mileage/lib/summary'

export default function MileageBreakdownSheet({
  open,
  onClose,
  totals,
  categories,
  formatDistance,
}: {
  open: boolean
  onClose: () => void
  totals: MileageCategoryTotal[]
  categories: MileageCategory[]
  formatDistance: (meters: number) => string
}) {
  const theme = useTheme()
  return (
    <Sheet
      open={open}
      onOpenChange={(value: boolean) => {
        if (!value) onClose()
      }}
      modal
      dismissOnSnapToBottom
      snapPoints={[55]}
    >
      <Sheet.Handle />
      <Sheet.Overlay />
      <Sheet.Frame padding={20} gap={20}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('mileage.dashboard.categories')}
          </Text>
          <IconButton
            noTransform
            icon={X}
            onPress={onClose}
            accessibilityLabel={i18n.t('close')}
          />
        </View>
        <Sheet.ScrollView>
          <View style={{ gap: 16, paddingBottom: 30 }}>
            {totals.length === 0 && (
              <Text>{i18n.t('mileage.dashboard.noCompletedEntries')}</Text>
            )}
            {totals.map((total) => (
              <View
                key={total.categoryId ?? 'uncategorized'}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <Text style={{ flex: 1 }}>
                  {mileageCategoryLabel(
                    categories,
                    total.categoryId,
                    i18n.t('mileage.dashboard.uncategorized'),
                    i18n.t('mileage.dashboard.unknownCategory')
                  )}
                </Text>
                <Text style={{ fontFamily: theme.fonts.semiBold }}>
                  {formatDistance(total.meters)}
                </Text>
              </View>
            ))}
          </View>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  )
}
