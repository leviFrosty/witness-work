import type { AppIcon } from '@/components/ui/LucideIcon'
import React, { PropsWithChildren, ReactNode } from 'react'
import { Pressable, StyleProp, View, ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import { rowPaddingVertical } from '@/constants/Inputs'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import IconButton from '@/components/ui/IconButton'

export interface InputRowContainerProps {
  children?: ReactNode
  leftIcon?: AppIcon
  lastInSection?: boolean
  noHorizontalPadding?: boolean
  label?: string
  info?: string
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
  info,
  justifyContent,
  gap,
  required,
  style,
  onLabelPress,
}: InputRowContainerProps) => {
  const theme = useTheme()
  const hasInfo = Boolean(label && info)

  const labelCluster = (leftIcon || label) && (
    <View
      style={{
        flexShrink: hasInfo ? 1 : undefined,
        alignItems: 'center',
        gap: 5,
        flexDirection: 'row',
      }}
    >
      {leftIcon && <IconButton icon={leftIcon} />}
      {label && (
        <Text
          style={{
            flexShrink: hasInfo ? 1 : undefined,
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

  const labelContent =
    labelCluster &&
    (onLabelPress ? (
      <Pressable
        onPress={onLabelPress}
        style={hasInfo ? { flexShrink: 1 } : undefined}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 4 }}
        accessibilityRole='button'
        accessibilityLabel={label}
      >
        {labelCluster}
      </Pressable>
    ) : (
      labelCluster
    ))

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
      {label && info ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}
        >
          {labelContent}
          <InfoPopover title={label} description={info} />
        </View>
      ) : (
        labelContent
      )}
      {children}
    </View>
  )
}

export default InputRowContainer
