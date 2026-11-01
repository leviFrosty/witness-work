import type { AppIcon } from '@/components/ui/LucideIcon'
import React, { PropsWithChildren, ReactNode } from 'react'
import { ViewStyle, View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import Haptics from '@/lib/haptics'
import useLinkMenuActions from '@/hooks/useLinkMenuActions'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'

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
  onPress?: () => void

  url?: string

  contextActions?: ContextMenuEntries

  disabled?: boolean

  sublabel?: string

  selected?: boolean

  checked?: boolean

  wrapValue?: boolean
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
  selected,
  checked,
  wrapValue,
  style,
  leftIcon,
  leftIconColor,
  leftIconFill,
  url,
  contextActions,
}: Props) => {
  const theme = useTheme()
  const linkActions = useLinkMenuActions({ url, label, onOpen: onPress })

  const menuActions: ContextMenuEntries = [
    ...linkActions,
    ...(contextActions ?? []),
  ]
  const hasMenu = !disabled && menuActions.length > 0

  const withMenu = (row: React.ReactElement) => (
    <ContextMenu
      accessibilityLabel={label}
      onPress={() => {
        Haptics.light()
        onPress?.()
      }}
      actions={menuActions}
    >
      {row}
    </ContextMenu>
  )

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    borderColor: theme.colors.border,
    borderBottomWidth: lastInSection ? 0 : 1,
    paddingBottom: 10,
    paddingTop: 10,
    paddingLeft: noHorizontalPadding ? 0 : inputLayout.horizontalPadding,
    paddingRight: noHorizontalPadding ? 0 : inputLayout.horizontalPadding,
    minHeight: 56,
    alignItems: 'center',
    flexGrow: 0,
    justifyContent: justifyContent ?? 'space-between',
    gap: inputLayout.controlGap,
    opacity: disabled ? 0.4 : 1,
    ...(selected && { backgroundColor: theme.colors.card }),
    ...style,
  }

  const content = (
    <>
      <View
        style={{
          flexDirection: 'row',
          gap: inputLayout.labelGap,
          alignItems: 'center',
          flexShrink: 1,
          ...(wrapValue && { flexShrink: 0, maxWidth: '50%' }),
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
          {}
          <WholeWordsText
            style={{
              fontFamily: theme.fonts.medium,
              fontSize: theme.fontSize('md'),
            }}
          >
            {label}
          </WholeWordsText>
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
      <View
        pointerEvents={hasMenu ? 'none' : undefined}
        style={{ flexShrink: wrapValue ? 1 : 0, alignItems: 'flex-end' }}
      >
        {children}
      </View>
    </>
  )

  if (hasMenu) return withMenu(<View style={rowStyle}>{content}</View>)

  return (
    <Button
      noTransform
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={
        onPress
          ? {
              disabled: !!disabled,
              ...(checked !== undefined && { selected: checked }),
            }
          : undefined
      }
      accessibilityLabel={
        !onPress && children == null && label
          ? [label, sublabel].filter(Boolean).join(', ')
          : undefined
      }
      disabled={disabled}
      style={rowStyle}
      onPress={onPress}
    >
      {content}
    </Button>
  )
}

export default InputRowButton
