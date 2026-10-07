import {
  List as ListIcon,
  LucideIcon as LucideIconType,
  Map as MapIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { ContactsView } from '@/types/homeStack'
import LucideIcon from '@/components/ui/LucideIcon'
import Button from '@/components/ui/Button'
import PointerTooltip from '@/components/ui/PointerTooltip'

const OPTIONS: {
  key: ContactsView
  icon: LucideIconType
  label: () => string
}[] = [
  { key: 'list', icon: ListIcon, label: () => i18n.t('contacts_view_list') },
  { key: 'map', icon: MapIcon, label: () => i18n.t('map') },
]

/**
 * Icon-only List/Map switch that sits among the Contacts header actions, so
 * choosing a view doesn't cost the list a full row.
 */
const ContactsViewToggle = ({
  value,
  onChange,
}: {
  value: ContactsView
  onChange: (view: ContactsView) => void
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
              onPress={() => onChange(key)}
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

export default ContactsViewToggle
