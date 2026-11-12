import { View } from 'react-native'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { inputLayout, RowSeparator } from '@/components/ui/inputs/InputLayout'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { doNotCallDate } from '@/features/territories/lib/doNotCallDate'
import type { DoNotCallEntry } from '@/features/territories/lib/doors'

export default function DoNotCallRow({
  entry,
  last,
  onEdit,
}: {
  entry: DoNotCallEntry
  last: boolean
  onEdit?: () => void
}) {
  const theme = useTheme()
  const detail = [
    i18n.t('territories.doNotCallEntrySince', {
      date: doNotCallDate(entry.at),
    }),
    entry.coordinate && i18n.t('territories.doNotCallPinned'),
  ]
    .filter(Boolean)
    .join(' · ')

  const content = (
    <View style={{ flex: 1, gap: inputLayout.descriptionGap, minWidth: 0 }}>
      <Text
        style={{
          fontFamily: theme.fonts.medium,
          fontSize: theme.fontSize('md'),
        }}
      >
        {entry.address}
      </Text>
      <Text
        style={{ fontSize: theme.fontSize('sm'), color: theme.colors.textAlt }}
      >
        {detail}
      </Text>
    </View>
  )

  const style = {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    minHeight: inputLayout.rowMinHeight,
    paddingVertical: inputLayout.rowPadding,
    paddingHorizontal: inputLayout.horizontalPadding,
  }

  return (
    <View
      testID={`dnc-row-${entry.id}`}
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      {onEdit ? (
        <Button
          noTransform
          onPress={onEdit}
          accessibilityLabel={`${entry.address}, ${detail}`}
          accessibilityHint={i18n.t('territories.pins.editDoNotCall_hint')}
          testID={`dnc-edit-${entry.id}`}
          style={style}
        >
          {content}
          <LucideIcon
            icon={ChevronForwardIcon}
            size={14}
            color={theme.colors.textAlt}
          />
        </Button>
      ) : (
        <View style={style}>{content}</View>
      )}
      {!last && <RowSeparator />}
    </View>
  )
}
