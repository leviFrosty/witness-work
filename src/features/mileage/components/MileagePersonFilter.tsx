import { View } from 'react-native'
import {
  ChevronDown as ChevronDownIcon,
  Users as UsersIcon,
} from 'lucide-react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import {
  EVERYONE,
  ME,
  type MileagePeople,
  type PersonFilter,
} from '@/lib/mileage/people'
import { personFilterLabels } from '@/features/mileage/lib/personLabel'
import type { MileageVehicle } from '@/types/mileage'

type Props = {
  value: PersonFilter
  onChange: (filter: PersonFilter) => void
  people: MileagePeople
  /** The User's cars, to tell apart two people with one name by car. */
  vehicles: readonly MileageVehicle[]
}

/**
 * Whose trips the Mileage screen shows: Everyone, Me, or one person on any of
 * the User's Shared Cars. A menu, so it stays one control however many people
 * there are.
 */
export default function MileagePersonFilter({
  value,
  onChange,
  people,
  vehicles,
}: Props) {
  const theme = useTheme()
  const labels = personFilterLabels(
    people.others,
    (spaceId) => vehicles.find((v) => v.spaceId === spaceId)?.name
  )
  const options = [
    { key: EVERYONE, label: i18n.t('mileage.everyone') },
    { key: ME, label: i18n.t('mileage.me') },
    ...people.others.map((person) => ({
      key: person.key,
      label: labels.get(person.key) ?? person.name,
    })),
  ]
  const selected = options.find((option) => option.key === value) ?? options[0]
  const action = (option: { key: string; label: string }) => ({
    id: option.key,
    title: option.label,
    checked: option.key === selected.key,
    onPress: () => onChange(option.key),
  })

  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
      <PullDownMenu
        accessibilityLabel={i18n.t('mileage.personFilter')}
        accessibilityValue={selected.label}
        actions={[
          options.slice(0, 2).map(action),
          options.length > 2 && options.slice(2).map(action),
        ]}
        pointerEffect='tint'
        hoverRadius={22}
        testID='mileage-person-filter'
      >
        <View
          style={{
            minHeight: MIN_TOUCH_TARGET,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            borderRadius: 22,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor:
              selected.key === EVERYONE
                ? theme.colors.border
                : theme.colors.accent,
            backgroundColor:
              selected.key === EVERYONE
                ? theme.colors.backgroundLighter
                : theme.colors.accentTranslucent,
          }}
        >
          <LucideIcon
            icon={UsersIcon}
            size={16}
            color={
              selected.key === EVERYONE
                ? theme.colors.textAlt
                : theme.colors.accent
            }
          />
          <Text
            numberOfLines={1}
            style={{
              flexShrink: 1,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {selected.label}
          </Text>
          <LucideIcon
            icon={ChevronDownIcon}
            size={14}
            color={theme.colors.textAlt}
          />
        </View>
      </PullDownMenu>
    </View>
  )
}
