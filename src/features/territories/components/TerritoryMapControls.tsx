import { View } from 'react-native'
import { isLiquidGlassAvailable } from 'expo-glass-effect'
import {
  LocateFixed as LocateFixedIcon,
  LocateOff as LocateOffIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const SIZE = 44
const glass = isLiquidGlassAvailable()

export default function TerritoryMapControls({
  top,
  locationAllowed,
  onLocation,
}: {
  top: number
  locationAllowed: boolean
  onLocation: () => void
}) {
  const theme = useTheme()
  const style = {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderCurve: 'continuous' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: glass ? undefined : `${theme.colors.card}EE`,
  }
  const control = (
    icon: AppIcon,
    label: string,
    onPress: () => void,
    testID: string
  ) => (
    <PointerTooltip
      label={label}
      placement='left'
      effect='none'
      style={{ borderRadius: SIZE / 2 }}
    >
      <Button
        variant='glass'
        accessibilityLabel={label}
        onPress={onPress}
        testID={testID}
        style={style}
      >
        <LucideIcon icon={icon} size={18} color={theme.colors.text} />
      </Button>
    </PointerTooltip>
  )
  const locationLabel = i18n.t(
    locationAllowed
      ? 'territories.map.goToLocation'
      : 'territories.map.showLocation'
  )

  return (
    <View
      pointerEvents='box-none'
      style={{
        position: 'absolute',
        top,
        right: 16,
        gap: 10,
        alignItems: 'flex-end',
      }}
    >
      {control(
        locationAllowed ? LocateFixedIcon : LocateOffIcon,
        locationLabel,
        onLocation,
        'territory-map-location'
      )}
    </View>
  )
}
