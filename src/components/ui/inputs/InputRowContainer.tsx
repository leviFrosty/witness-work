import type { AppIcon } from '@/components/ui/LucideIcon'
import React, { PropsWithChildren, ReactNode } from 'react'
import { Pressable, StyleProp, View, ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import {
  drawerLayout,
  inputLayout,
  useInputLayout,
} from '@/components/ui/inputs/InputLayout'

export interface InputRowContainerProps {
  children?: ReactNode
  leftIcon?: AppIcon
  lastInSection?: boolean
  noHorizontalPadding?: boolean
  label?: string
  description?: ReactNode
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
  controlStyle?: StyleProp<ViewStyle>
  /** Override the settings control width for multiline or compound controls. */
  controlWidth?: 'compact' | 'full' | 'auto'
}

const InputRowContainer: React.FC<
  PropsWithChildren<InputRowContainerProps>
> = ({
  children,
  leftIcon,
  lastInSection,
  noHorizontalPadding,
  label,
  description,
  info,
  justifyContent,
  gap,
  required,
  style,
  onLabelPress,
  controlStyle,
  controlWidth = 'compact',
}: InputRowContainerProps) => {
  const theme = useTheme()
  const layout = useInputLayout()
  const hasInfo = Boolean(label && info)
  const hasLabelContent = Boolean(label || leftIcon || description)

  const labelCluster = (leftIcon || label) && (
    <View
      style={{
        alignItems: 'center',
        gap: layout === 'drawer' ? drawerLayout.labelGap : 14,
        flexDirection: 'row',
        flexShrink: layout || hasInfo ? 1 : undefined,
      }}
    >
      {leftIcon && (
        <LucideIcon
          icon={leftIcon}
          size={layout === 'drawer' ? drawerLayout.iconSize : 21}
          color={theme.colors.textAlt}
        />
      )}
      {label && (
        <Text
          style={{
            flexDirection: 'column',
            gap: 10,
            flexShrink: layout || hasInfo ? 1 : undefined,
            fontFamily: theme.fonts.medium,
            fontSize: theme.fontSize('lg'),
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

  const labelTitle =
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

  const labelContent = (
    <>
      {label && info ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}
        >
          {labelTitle}
          <InfoPopover
            title={label}
            description={info}
            inline={layout === 'settings'}
          />
        </View>
      ) : (
        labelTitle
      )}
      {description && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
            lineHeight: layout === 'settings' ? undefined : 20,
          }}
        >
          {description}
        </Text>
      )}
    </>
  )

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          borderColor: theme.colors.border,
          borderBottomWidth: layout === 'drawer' || lastInSection ? 0 : 1,
          minHeight:
            layout === 'drawer'
              ? drawerLayout.rowMinHeight
              : inputLayout.rowMinHeight,
          paddingTop:
            layout === 'drawer'
              ? drawerLayout.rowPaddingVertical
              : inputLayout.rowPadding,
          paddingBottom:
            layout === 'drawer'
              ? drawerLayout.rowPaddingVertical
              : inputLayout.rowPadding,
          paddingLeft:
            layout === 'drawer'
              ? drawerLayout.horizontalPadding
              : noHorizontalPadding
                ? 0
                : inputLayout.horizontalPadding,
          paddingRight:
            layout === 'drawer'
              ? drawerLayout.horizontalPadding
              : noHorizontalPadding
                ? 0
                : inputLayout.horizontalPadding,
          alignItems: 'center',
          flexGrow: 0,
          justifyContent: justifyContent ?? 'space-between',
          gap: gap ?? (layout === 'drawer' ? 15 : inputLayout.controlGap),
          ...(controlWidth === 'full' && {
            flexDirection: 'column',
            alignItems: 'stretch',
          }),
        },
        style,
      ]}
    >
      {hasLabelContent ? (
        <View
          style={{
            flex: 1,
            gap: layout === 'settings' ? inputLayout.descriptionGap : 6,
            minWidth: 0,
          }}
        >
          {labelContent}
        </View>
      ) : (
        labelContent
      )}
      <View
        style={[
          {
            width:
              !hasLabelContent || controlWidth === 'full'
                ? '100%'
                : controlWidth === 'auto'
                  ? 'auto'
                  : '48%',
            maxWidth:
              !hasLabelContent || controlWidth !== 'compact'
                ? '100%'
                : inputLayout.controlMaxWidth,
            flexShrink: 1,
          },
          controlStyle,
        ]}
      >
        {children}
      </View>
    </View>
  )
}

export default InputRowContainer
