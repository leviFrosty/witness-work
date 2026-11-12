import { Platform, Pressable, View, useWindowDimensions } from 'react-native'
import {
  MapPin as MapPinIcon,
  MapPinOff as MapPinOffIcon,
  MapPinX as MapPinXIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Popover from '@/components/ui/Popover'
import PointerTooltip from '@/components/ui/PointerTooltip'
import Switch from '@/components/ui/Switch'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { DoorPinState } from '@/features/territories/lib/doorPins'

const DETAIL = {
  on: {
    title: 'territories.pins.pinning',
    description: 'territories.pins.pinning_info',
  },
  off: {
    title: 'territories.pins.pinning',
    description: 'territories.pins.pinning_info',
  },
  denied: {
    title: 'territories.pins.deniedTitle',
    description: Platform.select<TranslationKey>({
      web: 'territories.pins.deniedDescriptionWeb',
      default: 'territories.pins.deniedDescription',
    }),
  },
  away: {
    title: 'territories.pins.awayTitle',
    description: 'territories.pins.awayDescription',
  },
} as const

export default function DoorLocationToggle({
  state,
  fixWith,
  onToggle,
  onFix,
}: {
  state: DoorPinState
  fixWith: 'pinAnyway' | 'allowLocation' | 'openSettings' | null
  onToggle: (value: boolean) => void
  onFix: () => void
}) {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const warning = state === 'denied' || state === 'away'
  const label = i18n.t('territories.pins.pinning')
  const detail = DETAIL[state]
  const color = warning
    ? theme.colors.warnText
    : state === 'on'
      ? theme.colors.accent
      : theme.colors.textAlt

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Popover
        contentWidth={Math.min(300, width - 40)}
        contentStyle={{ padding: 16, gap: 8 }}
        renderTrigger={({ onPress, expanded }) => (
          <PointerTooltip label={label}>
            <Pressable
              onPress={onPress}
              testID={warning ? 'door-pin-info-attention' : 'door-pin-info'}
              accessibilityRole='button'
              accessibilityState={{ expanded }}
              accessibilityLabel={i18n.t('infoPopoverLabel', { title: label })}
              accessibilityValue={
                warning
                  ? {
                      text: i18n.t(
                        state === 'denied'
                          ? 'territories.pins.stateDenied'
                          : 'territories.pins.stateAway'
                      ),
                    }
                  : undefined
              }
              style={({ pressed }) => ({
                width: MIN_TOUCH_TARGET,
                height: MIN_TOUCH_TARGET,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <LucideIcon
                icon={
                  warning
                    ? MapPinXIcon
                    : state === 'on'
                      ? MapPinIcon
                      : MapPinOffIcon
                }
                size={20}
                color={color}
              />
            </Pressable>
          </PointerTooltip>
        )}
      >
        {({ closeThen }) => (
          <View testID='door-pin-explainer' style={{ gap: 8 }}>
            <Text
              accessibilityRole='header'
              style={{ fontFamily: theme.fonts.semiBold }}
            >
              {i18n.t(detail.title)}
            </Text>
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t(detail.description)}
            </Text>
            {fixWith && (
              <Button
                onPress={() => closeThen(onFix)}
                testID='door-pin-fix'
                style={{
                  alignSelf: 'flex-start',
                  minHeight: MIN_TOUCH_TARGET,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  marginTop: 4,
                  borderRadius: MIN_TOUCH_TARGET / 2,
                  backgroundColor: theme.colors.backgroundLighter,
                }}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.accent,
                  }}
                >
                  {i18n.t(`territories.pins.${fixWith}`)}
                </Text>
              </Button>
            )}
          </View>
        )}
      </Popover>
      <Button
        onPress={() => onToggle(state === 'off')}
        testID='door-pin-toggle'
        accessibilityRole='switch'
        accessibilityState={{ checked: state !== 'off' }}
        accessibilityLabel={label}
        style={{
          minHeight: MIN_TOUCH_TARGET,
          justifyContent: 'center',
        }}
      >
        <View
          pointerEvents='none'
          accessibilityElementsHidden
          importantForAccessibility='no-hide-descendants'
        >
          <Switch
            value={state !== 'off'}
            accessible={false}
            testID='door-pin-switch'
          />
        </View>
      </Button>
    </View>
  )
}
