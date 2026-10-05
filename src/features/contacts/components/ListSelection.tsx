import type { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import {
  Circle as CircleIcon,
  CircleCheck as CircleCheckIcon,
} from 'lucide-react-native'

import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerHover from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'

/** The checkmark circle a row shows in Select mode. */
export function SelectionCheck({ checked }: { checked: boolean }) {
  const theme = useTheme()
  return (
    <LucideIcon
      icon={checked ? CircleCheckIcon : CircleIcon}
      size={24}
      color={checked ? theme.colors.textInverse : theme.colors.textAlt}
      fill={checked ? theme.colors.accent : 'none'}
    />
  )
}

/**
 * A plain text button for Select mode chrome ("Select", "Select All", "Done").
 * `emphasized` is the button that ends the mode.
 */
export function SelectionTextButton({
  label,
  onPress,
  emphasized = false,
}: {
  label: string
  onPress: () => void
  emphasized?: boolean
}) {
  const theme = useTheme()
  return (
    <PointerHover effect='highlight'>
      <Pressable
        onPress={onPress}
        accessibilityRole='button'
        hitSlop={8}
        style={({ pressed }) => ({
          minHeight: 40,
          justifyContent: 'center',
          paddingHorizontal: 4,
          borderRadius: theme.numbers.borderRadiusSm,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text
          style={{
            color: theme.colors.accent,
            fontSize: theme.fontSize('md'),
            fontFamily: emphasized ? theme.fonts.bold : theme.fonts.semiBold,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </PointerHover>
  )
}

/**
 * Looks of a bottom-bar action. Also the non-interactive trigger for a
 * `PullDownMenu` in the bar (e.g. Dismiss For ▸), which owns the tap itself.
 */
export function SelectionBarItem({
  icon,
  label,
  disabled,
  destructive,
}: {
  icon: AppIcon
  label: string
  disabled?: boolean
  destructive?: boolean
}) {
  const theme = useTheme()
  const color = destructive ? theme.colors.error : theme.colors.accent
  return (
    <View
      style={{
        minHeight: 44,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <LucideIcon icon={icon} size={18} color={color} />
      <Text
        numberOfLines={1}
        style={{
          color,
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

/** A tappable bottom-bar action. */
export function SelectionBarButton({
  onPress,
  ...item
}: Parameters<typeof SelectionBarItem>[0] & { onPress: () => void }) {
  const theme = useTheme()
  return (
    <PointerHover effect='highlight' enabled={!item.disabled}>
      <Pressable
        onPress={onPress}
        disabled={item.disabled}
        accessibilityRole='button'
        accessibilityLabel={item.label}
        accessibilityState={{ disabled: !!item.disabled }}
        style={({ pressed }) => ({
          borderRadius: theme.numbers.borderRadiusSm,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <SelectionBarItem {...item} />
      </Pressable>
    </PointerHover>
  )
}

/**
 * Floating bottom bar of batch actions shown while selecting, like the toolbar
 * iOS swaps in for edit mode. `bottom` clears whatever sits below it (the safe
 * area, the tab bar).
 */
export function SelectionBar({
  children,
  bottom,
}: {
  children: ReactNode
  bottom: number
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 26,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
        shadowColor: theme.colors.shadow,
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      {children}
    </View>
  )
}

/** Height to reserve under a list so its last row clears the bar. */
export const SELECTION_BAR_HEIGHT = 64
