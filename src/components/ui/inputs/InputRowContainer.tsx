import type { AppIcon } from '@/components/ui/LucideIcon'
import React, { PropsWithChildren, ReactNode } from 'react'
import { Pressable, StyleProp, View, ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import { inputLayout } from '@/components/ui/inputs/InputLayout'

export interface InputRowContainerProps {
  invalid?: boolean
  children?: ReactNode
  leftIcon?: AppIcon
  lastInSection?: boolean
  noHorizontalPadding?: boolean
  label?: string
  description?: ReactNode
  /**
   * Right after the label (and its info), e.g. where a setting's value comes
   * from.
   */
  labelTrailing?: ReactNode
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
  invalid,
  leftIcon,
  lastInSection,
  noHorizontalPadding,
  label,
  description,
  labelTrailing,
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
  const hasInfo = Boolean(label && (info || labelTrailing))
  const hasLabelContent = Boolean(label || leftIcon || description)

  const labelCluster = (leftIcon || label) && (
    <View
      style={{
        alignItems: 'center',
        gap: inputLayout.labelGap,
        flexDirection: 'row',
        flexShrink: 1,
      }}
    >
      {leftIcon && (
        <LucideIcon
          icon={leftIcon}
          size={inputLayout.iconSize}
          color={theme.colors.textAlt}
        />
      )}
      {label && (
        <Text
          style={{
            flexDirection: 'column',
            gap: 10,
            flexShrink: 1,
            fontFamily: theme.fonts.medium,
            fontSize: theme.fontSize('md'),
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
      {label && (info || labelTrailing) ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}
        >
          {labelTitle}
          {/* Before the info icon, whose tap target reaches past it. */}
          {labelTrailing}
          {info && <InfoPopover title={label} description={info} inline />}
        </View>
      ) : (
        labelTitle
      )}
      {description && (
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
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
          borderBottomWidth: lastInSection ? 0 : 1,
          minHeight: inputLayout.rowMinHeight,
          paddingTop: inputLayout.rowPadding,
          paddingBottom: inputLayout.rowPadding,
          paddingLeft: noHorizontalPadding ? 0 : inputLayout.horizontalPadding,
          paddingRight: noHorizontalPadding ? 0 : inputLayout.horizontalPadding,
          alignItems: 'center',
          flexGrow: 0,
          justifyContent: justifyContent ?? 'space-between',
          gap: gap ?? inputLayout.controlGap,
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
            gap: inputLayout.descriptionGap,
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
          invalid && {
            borderWidth: 1,
            borderColor: theme.colors.error,
            borderRadius: theme.numbers.borderRadiusMd,
          },
        ]}
      >
        {children}
      </View>
    </View>
  )
}

export default InputRowContainer
