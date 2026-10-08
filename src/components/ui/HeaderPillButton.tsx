import { ActivityIndicator, View, type ViewStyle } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'

type Props = {
  icon: AppIcon
  label: string
  onPress: () => void
  /** Defaults to `label`; extend it when the badge carries meaning. */
  accessibilityLabel?: string
  /** A dot for something waiting, e.g. requests to confirm. */
  badge?: boolean
  /** A spinner in the icon's place; not pressable until it's ready. */
  loading?: boolean
  /** Dimmed and not pressable; say why in `accessibilityLabel`. */
  disabled?: boolean
  /**
   * Icon only, for a header without room for the label. The label still names
   * it to VoiceOver and as a pointer tooltip.
   */
  compact?: boolean
}

/** ActivityIndicator's `small` size; scaled down to the icon's. */
const SPINNER_SIZE = 20

/** A labeled root-header action, for places and tasks an icon can't name. */
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
  const pill: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    ...(compact
      ? { width: 36, justifyContent: 'center' }
      : { paddingHorizontal: 12 }),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentTranslucent,
    // Set only when dimmed, so it doesn't override the pressed state's.
    ...(disabled ? { opacity: 0.5 } : null),
  }
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
      {compact ? null : (
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
      )}
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

  if (loading)
    return (
      <View
        accessible
        accessibilityRole='button'
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ busy: true }}
        style={pill}
      >
        {content}
      </View>
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
  return compact ? (
    <PointerTooltip label={label} effect='none'>
      {button}
    </PointerTooltip>
  ) : (
    button
  )
}
