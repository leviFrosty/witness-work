import {
  ArrowDown as ArrowDownIcon,
  ArrowUp as ArrowUpIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export type SortDirection = 'asc' | 'desc'

const DIRECTIONS = [
  { value: 'asc', label: 'contacts_sortAscending', icon: ArrowUpIcon },
  { value: 'desc', label: 'contacts_sortDescending', icon: ArrowDownIcon },
] as const

export default function SortDirectionButtons({
  value,
  onChange,
}: {
  value: SortDirection
  onChange: (direction: SortDirection) => void
}) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {DIRECTIONS.map((direction) => {
        const selected = value === direction.value
        return (
          <Button
            key={direction.value}
            onPress={() => onChange(direction.value)}
            noTransform
            accessibilityState={{ selected }}
            testID={`sort-direction-${direction.value}`}
            style={{
              flex: 1,
              height: 40,
              borderRadius: theme.numbers.borderRadiusSm,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: selected
                ? theme.colors.accentTranslucent
                : theme.colors.backgroundLighter,
              borderWidth: 1,
              borderColor: selected ? theme.colors.accent : theme.colors.border,
            }}
          >
            <LucideIcon
              icon={direction.icon}
              size={theme.fontSize('sm')}
              style={{
                color: selected ? theme.colors.accent : theme.colors.text,
              }}
            />
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                fontFamily: selected
                  ? theme.fonts.semiBold
                  : theme.fonts.regular,
                color: selected ? theme.colors.accent : theme.colors.text,
              }}
            >
              {i18n.t(direction.label)}
            </Text>
          </Button>
        )
      })}
    </View>
  )
}
