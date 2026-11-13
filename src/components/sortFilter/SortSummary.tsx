import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
} from 'lucide-react-native'
import { type StyleProp, View, type ViewStyle } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import type { SortDirection } from '@/components/sortFilter/SortDirectionButtons'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function SortSummary({
  label,
  direction,
  style,
}: {
  label: string
  direction: SortDirection
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}
    >
      <LucideIcon
        icon={direction === 'asc' ? ArrowUpIcon : ArrowDownIcon}
        size={theme.fontSize('xs')}
        style={{ color: theme.colors.textAlt }}
      />
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
        }}
        numberOfLines={1}
      >
        {i18n.t('contacts_sortAndFilter_sortLabel', { label })}
      </Text>
    </View>
  )
}
