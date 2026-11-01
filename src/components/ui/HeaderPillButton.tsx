import { useEffect, useState } from 'react'
import { ActivityIndicator, View, type ViewStyle } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { useRootHeaderTitleFit } from '@/components/RootHeader'
import useTheme from '@/contexts/theme'

type Props = {
  icon: AppIcon
  label: string
  onPress: () => void

  accessibilityLabel?: string

  badge?: boolean

  loading?: boolean

  disabled?: boolean

  compact?: boolean | 'auto'
}

const SPINNER_SIZE = 20

const COMPACT_SIZE = 36

export default function HeaderPillButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
  badge,
  loading,
  disabled,
  compact = false,
}: Props) {
  const theme = useTheme()
  const iconSize = theme.fontSize('md')
  const titleFit = useRootHeaderTitleFit()
  const room = titleFit?.room
  const needs = titleFit?.needs
  const [labeledWidth, setLabeledWidth] = useState<number>()
  const [fits, setFits] = useState(false)
  useEffect(() => {
    if (room === undefined || needs === undefined) return
    if (labeledWidth === undefined) return

    setFits((labeled) =>
      labeled ? room >= needs : room - (labeledWidth - COMPACT_SIZE) >= needs
    )
  }, [room, needs, labeledWidth])
  const iconOnly = compact === 'auto' ? !fits : compact

  const pillStyle = (small: boolean): ViewStyle => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: COMPACT_SIZE,
    ...(small
      ? { width: COMPACT_SIZE, justifyContent: 'center' }
      : { paddingHorizontal: 12 }),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentTranslucent,

    ...(disabled ? { opacity: 0.5 } : null),
  })
  const pill = pillStyle(iconOnly)
  const labelText = (
    <Text
      numberOfLines={1}
      style={{
        color: theme.colors.accent,
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('sm'),
      }}
    >
      {label}
    </Text>
  )
  const content = (
    <>
      {loading ? (
        <View
          style={{
            width: iconSize,
            height: iconSize,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ActivityIndicator
            size='small'
            color={theme.colors.accent}
            style={{ transform: [{ scale: iconSize / SPINNER_SIZE }] }}
          />
        </View>
      ) : (
        <LucideIcon icon={icon} size={iconSize} color={theme.colors.accent} />
      )}
      {iconOnly ? null : labelText}
      {badge && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.colors.error,
          }}
        />
      )}
    </>
  )

  const measure = compact === 'auto' && (
    <View
      pointerEvents='none'
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        position: 'absolute',
        width: 9999,
        flexDirection: 'row',
        opacity: 0,
      }}
    >
      <View
        onLayout={(e) => setLabeledWidth(e.nativeEvent.layout.width)}
        style={pillStyle(false)}
      >
        <View style={{ width: iconSize, height: iconSize }} />
        {labelText}
      </View>
    </View>
  )

  if (loading)
    return (
      <>
        {measure}
        <View
          accessible
          accessibilityRole='button'
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ busy: true }}
          style={pill}
        >
          {content}
        </View>
      </>
    )

  const button = (
    <Button
      noTransform
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={disabled ? { disabled: true } : undefined}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={pill}
    >
      {content}
    </Button>
  )
  return (
    <>
      {measure}
      {iconOnly ? (
        <PointerTooltip label={label} effect='none'>
          {button}
        </PointerTooltip>
      ) : (
        button
      )}
    </>
  )
}
