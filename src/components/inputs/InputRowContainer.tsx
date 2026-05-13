import React, { PropsWithChildren, ReactNode } from 'react'
import { Pressable, StyleProp, View, ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import { rowPaddingVertical } from '@/constants/Inputs'
import Text from '@/components/MyText'
import IconButton from '@/components/IconButton'
import { IconProp } from '@fortawesome/fontawesome-svg-core'

export interface InputRowContainerProps {
  children?: ReactNode
  leftIcon?: IconProp
  lastInSection?: boolean
  noHorizontalPadding?: boolean
  label?: string
  justifyContent?:
    | 'flex-start'
    | 'flex-end'
    | 'center'
    | 'space-between'
    | 'space-around'
    | 'space-evenly'
    | undefined
  gap?: number
  required?: boolean
  style?: StyleProp<ViewStyle>
  onLabelPress?: () => void
}

const InputRowContainer: React.FC<
  PropsWithChildren<InputRowContainerProps>
> = ({
  children,
  leftIcon,
  lastInSection,
  noHorizontalPadding,
  label,
  justifyContent,
  gap,
  required,
  style,
  onLabelPress,
}: InputRowContainerProps) => {
  const theme = useTheme()

  const labelCluster = (leftIcon || label) && (
    <View
      style={{
        alignItems: 'center',
        gap: 5,
        flexDirection: 'row',
      }}
    >
      {leftIcon && <IconButton icon={leftIcon} />}
      {label && (
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {label}
        </Text>
      )}
      {required && (
        <Text
          style={{
            color: theme.colors.error,
            fontSize: theme.fontSize('sm'),
          }}
        >
          *
        </Text>
      )}
    </View>
  )

  return (
    <View
      style={[
        [
          {
            flexDirection: 'row',
            borderColor: theme.colors.border,
            borderBottomWidth: lastInSection ? 0 : 1,
            paddingBottom: lastInSection ? 0 : rowPaddingVertical,
            paddingRight: noHorizontalPadding ? 0 : 20,
            alignItems: 'center',
            flexGrow: 1,
            justifyContent,
            gap: gap || 15,
          },
        ],
        [style],
      ]}
    >
      {labelCluster &&
        (onLabelPress ? (
          <Pressable
            onPress={onLabelPress}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 4 }}
            accessibilityRole='button'
            accessibilityLabel={label}
          >
            {labelCluster}
          </Pressable>
        ) : (
          labelCluster
        ))}
      {children}
    </View>
  )
}

export default InputRowContainer
