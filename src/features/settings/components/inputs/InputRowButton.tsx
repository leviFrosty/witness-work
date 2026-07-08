import type { AppIcon } from '@/components/ui/LucideIcon'
import React, { PropsWithChildren, ReactNode } from 'react'
import { GestureResponderEvent, ViewStyle, View } from 'react-native'
import useTheme from '@/contexts/theme'
import { rowPaddingVertical } from '@/constants/Inputs'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'

interface Props {
  children?: ReactNode
  lastInSection?: boolean
  noHorizontalPadding?: boolean
  label?: string
  leftIcon?: AppIcon
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
}: Props) => {
  const theme = useTheme()

  return (
    <Button
      noTransform
      disabled={disabled}
      style={{
        flexDirection: 'row',
        borderColor: theme.colors.border,
        borderBottomWidth: lastInSection ? 0 : 1,
        paddingBottom: lastInSection ? 0 : rowPaddingVertical,
        paddingRight: noHorizontalPadding ? 0 : 20,
        alignItems: 'center',
        flexGrow: 1,
        justifyContent: justifyContent ?? 'space-between',
        gap: 15,
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
      onPress={onPress}
    >
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        {leftIcon && <IconButton icon={leftIcon} />}
        <View style={{ flexDirection: 'column', flexShrink: 1 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>{label}</Text>
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
      {children}
    </Button>
  )
}

export default InputRowButton
