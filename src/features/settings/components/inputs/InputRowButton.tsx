import type { AppIcon } from '@/components/ui/LucideIcon'
import React, { PropsWithChildren, ReactNode } from 'react'
import { GestureResponderEvent, Pressable, ViewStyle, View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import {
  drawerLayout,
  inputLayout,
  useInputLayout,
} from '@/components/ui/inputs/InputLayout'
import Haptics from '@/lib/haptics'

interface Props {
  children?: ReactNode
  lastInSection?: boolean
  noHorizontalPadding?: boolean
  label?: string
  leftIcon?: AppIcon
  leftIconColor?: string
  leftIconFill?: string
  justifyContent?:
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'
    | undefined
  onPress?: ((event: GestureResponderEvent) => void) | undefined
  /** When true, dims the row and blocks the press. */
  disabled?: boolean
  /** Optional secondary line under the label (e.g. a reason it's disabled). */
  sublabel?: string
  style?: ViewStyle
}

const InputRowButton: React.FC<PropsWithChildren<Props>> = ({
  children,
  lastInSection,
  noHorizontalPadding,
  label,
  justifyContent,
  onPress,
  disabled,
  sublabel,
  style,
  leftIcon,
  leftIconColor,
  leftIconFill,
}: Props) => {
  const theme = useTheme()
  const layout = useInputLayout()

  if (layout === 'drawer') {
    return (
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={(event) => {
          Haptics.light()
          onPress?.(event)
        }}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: drawerLayout.rowMinHeight,
            paddingHorizontal: drawerLayout.horizontalPadding,
            paddingVertical: drawerLayout.rowPaddingVertical,
            gap: drawerLayout.labelGap,
            borderRadius: theme.numbers.borderRadiusLg,
            backgroundColor: pressed ? theme.colors.card : 'transparent',
            opacity: disabled ? 0.4 : 1,
          },
          style,
        ]}
      >
        {leftIcon && (
          <LucideIcon
            icon={leftIcon}
            size={drawerLayout.iconSize}
            color={leftIconColor ?? theme.colors.textAlt}
            fill={leftIconFill}
          />
        )}
        <View style={{ flex: 1, gap: 5 }}>
          <Text
            style={{
              fontFamily: theme.fonts.medium,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {label}
          </Text>
          {sublabel && (
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >
              {sublabel}
            </Text>
          )}
        </View>
        <View pointerEvents='none' style={{ opacity: 0.6 }}>
          {children}
        </View>
      </Pressable>
    )
  }

  return (
    <Button
      noTransform
      disabled={disabled}
      style={{
        flexDirection: 'row',
        borderColor: theme.colors.border,
        borderBottomWidth: lastInSection ? 0 : 1,
        paddingBottom: 12,
        paddingTop: 12,
        paddingLeft: noHorizontalPadding ? 0 : inputLayout.horizontalPadding,
        paddingRight: noHorizontalPadding ? 0 : inputLayout.horizontalPadding,
        minHeight: 64,
        alignItems: 'center',
        flexGrow: 0,
        justifyContent: justifyContent ?? 'space-between',
        gap: inputLayout.controlGap,
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
      onPress={onPress}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: inputLayout.labelGap,
          alignItems: 'center',
          flexShrink: 1,
        }}
      >
        {leftIcon && (
          <LucideIcon
            icon={leftIcon}
            size={inputLayout.iconSize}
            color={leftIconColor ?? theme.colors.textAlt}
            fill={leftIconFill}
          />
        )}
        <View style={{ flexDirection: 'column', flexShrink: 1, gap: 4 }}>
          <Text
            style={{
              fontFamily: theme.fonts.medium,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {label}
          </Text>
          {sublabel && (
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
              }}
            >
              {sublabel}
            </Text>
          )}
        </View>
      </View>
      <View style={{ flexShrink: 0, alignItems: 'flex-end' }}>{children}</View>
    </Button>
  )
}

export default InputRowButton
