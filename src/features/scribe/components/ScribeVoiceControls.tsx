import { View } from 'react-native'
import moment from 'moment'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { localizeDisplayDate } from '@/lib/dates'
import { formatSecondsSpoken } from '@/lib/minutes'

export const RoundButton = ({
  size,
  icon,
  iconSize,
  background,
  foreground,
  label,
  labelColor,
  onPress,
  halo,
  showHalo = false,
  room,
  disabled,
}: {
  size: number
  icon: AppIcon
  iconSize?: number
  background: string
  foreground: string
  label: string
  labelColor?: string
  onPress: () => void

  halo?: string
  showHalo?: boolean

  room?: number
  disabled?: boolean
}) => {
  const theme = useTheme()
  const square = room ?? size + (halo ? 12 : 0)
  return (
    <View style={{ alignItems: 'center', gap: 7 }}>
      <View
        style={{
          width: square,
          height: square,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {halo && showHalo ? (
          <>
            <View
              pointerEvents='none'
              style={{
                position: 'absolute',
                width: size + 20,
                height: size + 20,
                borderRadius: (size + 20) / 2,
                backgroundColor: halo,
                opacity: 0.12,
              }}
            />
            <View
              pointerEvents='none'
              style={{
                position: 'absolute',
                width: size + 9,
                height: size + 9,
                borderRadius: (size + 9) / 2,
                borderWidth: 2,
                borderColor: halo,
                opacity: 0.45,
              }}
            />
          </>
        ) : null}
        <Button
          noTransform
          onPress={onPress}
          disabled={disabled}
          accessibilityLabel={label}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: background,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <LucideIcon
            icon={icon}
            size={iconSize ?? size * 0.42}
            color={foreground}
            strokeWidth={2.4}
          />
        </Button>
      </View>
      <Text
        importantForAccessibility='no'
        accessibilityElementsHidden
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.medium,
          color: labelColor ?? theme.colors.textAlt,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

export const Elapsed = ({ ms }: { ms: number }) => {
  const theme = useTheme()
  const seconds = Math.floor(ms / 1000)
  return (
    <View
      accessible
      accessibilityLabel={formatSecondsSpoken(seconds)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.colors.error,
        }}
      />
      <Text
        style={{
          fontSize: theme.fontSize('md'),
          fontFamily: theme.fonts.medium,
          color: theme.colors.textAlt,
          fontVariant: ['tabular-nums'],
        }}
      >
        {localizeDisplayDate(moment.utc(seconds * 1000).format('m:ss'))}
      </Text>
    </View>
  )
}
