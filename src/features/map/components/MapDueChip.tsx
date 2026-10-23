import { View } from 'react-native'
import { Clock as ClockIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { MAP_BUTTON_HEIGHT, mapPillStyle } from '@/features/map/lib/mapStyles'

/**
 * How many Contacts in view are overdue or due this week. Tapping it keeps only
 * them bright, with their cards, until tapped again.
 */
export default function MapDueChip({
  overdue,
  thisWeek,
  active,
  onPress,
}: {
  overdue: number
  thisWeek: number
  active: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const label = i18n.t(active ? 'map_due_showAll' : 'map_due_showOnly')
  const overdueText = i18n.t('map_due_overdue' as TranslationKey, {
    count: overdue,
  })
  const weekText = i18n.t('map_due_week' as TranslationKey, {
    count: thisWeek,
  })
  const part = (text: string, color: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        }}
      />
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {text}
      </Text>
    </View>
  )

  return (
    <PointerTooltip
      label={label}
      placement='bottom'
      style={{ borderRadius: MAP_BUTTON_HEIGHT / 2 }}
    >
      <Button
        variant='glass'
        accessibilityLabel={[
          overdue > 0 && overdueText,
          thisWeek > 0 && weekText,
          label,
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={{
          ...mapPillStyle(theme.colors.card),
          borderWidth: active ? 2 : 0,
          borderColor: theme.colors.accent,
        }}
      >
        <LucideIcon
          icon={ClockIcon}
          size={theme.fontSize('sm')}
          color={active ? theme.colors.accent : theme.colors.text}
        />
        {overdue > 0 && part(overdueText, theme.colors.error)}
        {thisWeek > 0 && part(weekText, theme.colors.accent)}
      </Button>
    </PointerTooltip>
  )
}
