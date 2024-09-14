import React, { PropsWithChildren, ReactNode } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import useTheme from '../../contexts/theme'
import { rowPaddingVertical } from '../../constants/Inputs'
import Text from '../MyText'
import IconButton from '../IconButton'
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
}: InputRowContainerProps) => {
  const theme = useTheme()

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
      {(leftIcon || label) && (
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
      )}
      {children}
    </View>
  )
}

export default InputRowContainer
