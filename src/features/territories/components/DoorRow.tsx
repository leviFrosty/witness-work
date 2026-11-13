import { View } from 'react-native'
import {
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  MapPin as MapPinIcon,
  MapPinPlus as MapPinPlusIcon,
  Trash2 as Trash2Icon,
  UserPlus as UserPlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { inputLayout, RowSeparator } from '@/components/ui/inputs/InputLayout'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  OUTCOME_ICON,
  OUTCOME_LABEL,
  outcomeColor,
} from '@/features/territories/lib/outcomes'
import {
  doorRecordedText,
  recordedByText,
} from '@/features/territories/lib/shareText'
import type { TerritoryDoor } from '@/features/territories/types/territory'

const BADGE = 36

function RowAction({
  icon,
  label,
  color,
  onPress,
  testID,
}: {
  icon: AppIcon
  label: string
  color: string
  onPress: () => void
  testID: string
}) {
  const theme = useTheme()
  return (
    <Button
      onPress={onPress}
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 22,
        backgroundColor: theme.colors.card,
      }}
    >
      <LucideIcon icon={icon} size={18} color={color} />
      <Text style={{ fontFamily: theme.fonts.semiBold, color }}>{label}</Text>
    </Button>
  )
}

export default function DoorRow({
  door,
  title,
  open,
  current,
  last,
  onToggle,
  onAddContact,
  onRemove,
  onPlacePin,
  recordedBy,
  mine,
  fresh,
  plain = false,
}: {
  door: TerritoryDoor
  title: string

  recordedBy?: string

  mine?: boolean

  fresh?: boolean

  plain?: boolean

  open: boolean

  current: boolean
  last: boolean
  onToggle: () => void
  onAddContact?: () => void
  onRemove?: () => void

  onPlacePin?: () => void
}) {
  const theme = useTheme()
  const color = outcomeColor(door.outcome, theme.colors)
  const outcome = i18n.t(OUTCOME_LABEL[door.outcome])
  const rest = [
    door.tries > 1 && i18n.t('territories.tries', { count: door.tries }),
    recordedBy && recordedByText(recordedBy, door.at),
    !recordedBy && mine && recordedByText(null, door.at),
    !recordedBy && !mine && doorRecordedText(door.at),
  ]
    .filter(Boolean)
    .join(' · ')
  const detail = `${outcome} · ${rest}`

  return (
    <View
      style={{
        backgroundColor: fresh
          ? theme.colors.accentTranslucent
          : open || current
            ? theme.colors.backgroundLighter
            : undefined,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Button
          noTransform
          onPress={onToggle}
          accessibilityLabel={`${title}, ${detail}`}
          accessibilityHint={i18n.t('territories.doorRow_hint')}
          accessibilityState={{ selected: current, expanded: open }}
          testID={`door-row-${door.label}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: inputLayout.labelGap,
            minHeight: inputLayout.rowMinHeight,
            paddingVertical: 10,
            flex: 1,
            paddingLeft: inputLayout.horizontalPadding,
            paddingRight: inputLayout.horizontalPadding,
          }}
        >
          <View
            style={{
              width: BADGE,
              height: BADGE,
              borderRadius: BADGE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${color}22`,
            }}
          >
            <LucideIcon
              icon={OUTCOME_ICON[door.outcome]}
              size={18}
              color={color}
            />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('md'),
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  fontFamily: theme.fonts.semiBold,
                  color,
                }}
              >
                {outcome}
              </Text>
              {` · ${rest}`}
            </Text>
          </View>
          <LucideIcon
            icon={
              plain
                ? ChevronForwardIcon
                : open
                  ? ChevronUpIcon
                  : ChevronDownIcon
            }
            size={18}
            color={theme.colors.textAlt}
          />
        </Button>
      </View>
      {open && (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 10,
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingBottom: 14,
          }}
        >
          {door.outcome === 'spoke' && onAddContact && (
            <RowAction
              icon={UserPlusIcon}
              label={i18n.t('territories.addContact')}
              color={theme.colors.text}
              onPress={onAddContact}
              testID={`door-contact-${door.label}`}
            />
          )}
          {onPlacePin && (
            <RowAction
              icon={door.coordinate ? MapPinIcon : MapPinPlusIcon}
              label={i18n.t(
                door.coordinate
                  ? 'territories.pins.movePin'
                  : 'territories.pins.addPin'
              )}
              color={theme.colors.text}
              onPress={onPlacePin}
              testID={`door-pin-${door.label}`}
            />
          )}
          {onRemove && (
            <RowAction
              icon={Trash2Icon}
              label={i18n.t('territories.removeDoor_action')}
              color={theme.colors.error}
              onPress={onRemove}
              testID={`door-remove-${door.label}`}
            />
          )}
        </View>
      )}
      {!last && <RowSeparator hasIcon />}
    </View>
  )
}
