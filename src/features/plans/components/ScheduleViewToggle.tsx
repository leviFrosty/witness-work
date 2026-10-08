import {
  CalendarDays as CalendarDaysIcon,
  LayoutGrid as LayoutGridIcon,
  LucideIcon as LucideIconType,
} from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Haptics from '@/lib/haptics'
import LucideIcon from '@/components/ui/LucideIcon'
import Button from '@/components/ui/Button'
import PointerTooltip from '@/components/ui/PointerTooltip'

export type ScheduleView = 'year' | 'month'

const OPTIONS: {
  key: ScheduleView
  icon: LucideIconType
  label: () => string
}[] = [
  { key: 'year', icon: LayoutGridIcon, label: () => i18n.t('year') },
  { key: 'month', icon: CalendarDaysIcon, label: () => i18n.t('month') },
]

/**
 * Icon-only Year/Month switch among the Schedule header actions, matching
 * Contacts' List/Map switch. Year sits first: it's the zoomed-out view.
 */
const ScheduleViewToggle = ({
  value,
  onChange,
}: {
  value: ScheduleView
  onChange: (view: ScheduleView) => void
}) => {
  const theme = useTheme()
  return (
    <View
      accessibilityRole='tablist'
      style={{
        flexDirection: 'row',
        padding: 2,
        borderRadius: 999,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      {OPTIONS.map(({ key, icon, label }) => {
        const active = key === value
        return (
          <PointerTooltip key={key} label={label()} effect='none'>
            <Button
              onPress={() => {
                if (active) return
                Haptics.selection()
                onChange(key)
              }}
              noTransform
              accessibilityRole='tab'
              accessibilityLabel={label()}
              accessibilityState={{ selected: active }}
              style={{
                width: 44,
                height: 36,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active
                  ? theme.colors.accentTranslucent
                  : 'transparent',
              }}
            >
              <LucideIcon
                icon={icon}
                size={theme.fontSize('lg')}
                style={{
                  color: active ? theme.colors.accent : theme.colors.textAlt,
                }}
              />
            </Button>
          </PointerTooltip>
        )
      })}
    </View>
  )
}

export default ScheduleViewToggle
