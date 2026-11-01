import { View, type StyleProp, type ViewStyle } from 'react-native'
import {
  Flag as FlagIcon,
  Play as PlayIcon,
  Plus as PlusIcon,
  X as XIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { DroppedPin } from '@/features/route-planning/components/RouteMap'
import { MAX_ROUTE_STOPS } from '@/features/route-planning/lib/routeLimits'

export default function DroppedPinCard({
  pin,
  canAdd,
  onAdd,
  onStartHere,
  onFinishHere,
  onDismiss,
  style,
}: {
  pin: DroppedPin

  canAdd: boolean
  onAdd: () => void
  onStartHere: () => void
  onFinishHere: () => void
  onDismiss: () => void
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const { latitude, longitude } = pin.coordinate
  const coordinates = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`

  return (
    <View
      style={[
        {
          gap: 10,
          padding: 12,
          borderRadius: theme.numbers.borderRadiusLg,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.card,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ fontFamily: theme.fonts.semiBold }}>
            {pin.title ?? i18n.t('map_droppedPin')}
          </Text>
          <Text
            selectable
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {coordinates}
          </Text>
        </View>
        <IconButton
          icon={XIcon}
          size={16}
          color={theme.colors.textAlt}
          accessibilityLabel={i18n.t('routeBuilder_dismissPin')}
          onPress={onDismiss}
        />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <PinAction
          icon={PlusIcon}
          label={i18n.t('routeBuilder_addStopHere')}
          primary
          disabled={!canAdd}
          onPress={onAdd}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PinAction
          icon={PlayIcon}
          label={i18n.t('routeBuilder_startHere')}
          onPress={onStartHere}
        />
        <PinAction
          icon={FlagIcon}
          label={i18n.t('routeBuilder_finishHere')}
          onPress={onFinishHere}
        />
      </View>
      {!canAdd && (
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {i18n.t('routePlan_stopLimit', { max: MAX_ROUTE_STOPS })}
        </Text>
      )}
    </View>
  )
}

function PinAction({
  icon,
  label,
  primary,
  disabled,
  onPress,
}: {
  icon: AppIcon
  label: string
  primary?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const color = primary ? theme.colors.textInverse : theme.colors.text

  const background = primary
    ? disabled
      ? theme.colors.accentAlt
      : theme.colors.accent
    : theme.colors.backgroundLightest
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: background,
      }}
    >
      <LucideIcon icon={icon} size={15} color={color} />
      <Text
        numberOfLines={1}
        style={{
          color,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {label}
      </Text>
    </Button>
  )
}
