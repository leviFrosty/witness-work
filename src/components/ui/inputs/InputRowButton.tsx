import type { AppIcon } from '@/components/ui/LucideIcon'
import React, { PropsWithChildren, ReactNode, useState } from 'react'
import { Pressable, StyleProp, ViewStyle, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useToastController } from '@tamagui/toast'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import {
  drawerLayout,
  inputLayout,
  useInputLayout,
} from '@/components/ui/inputs/InputLayout'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { shareUrl } from '@/lib/share'
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
  /**
   * External link the row opens. Adds a long-press menu with Open (the row's
   * `onPress`), Copy Link, and Share….
   */
  url?: string
  /** Extra long-press menu items, listed after the link actions. */
  contextActions?: ContextMenuEntries
  /** When true, dims the row and blocks the press. */
  disabled?: boolean
  /** Optional secondary line under the label (e.g. a reason it's disabled). */
  sublabel?: string
  /** Highlights the row whose destination is open beside the list. */
  selected?: boolean
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
  style,
  leftIcon,
  leftIconColor,
  leftIconFill,
  url,
  contextActions,
}: Props) => {
  const theme = useTheme()
  const layout = useInputLayout()
  const toast = useToastController()
  const [hovered, setHovered] = useState(false)

  const copyLink = async (link: string) => {
    try {
      await Clipboard.setStringAsync(link)
      Haptics.success()
      toast.show(i18n.t('linkCopied'), { native: true, duration: 2000 })
    } catch {
      Haptics.error()
    }
  }

  const menuActions: ContextMenuEntries = [
    ...(url
      ? [
          [
            onPress && {
              id: 'open',
              title: i18n.t('open'),
              systemImage: 'safari' as const,
              onPress,
            },
            {
              id: 'copy_link',
              title: i18n.t('copyLink'),
              systemImage: 'link' as const,
              onPress: () => void copyLink(url),
            },
            {
              id: 'share',
              title: i18n.t('shareEllipsis'),
              systemImage: 'square.and.arrow.up' as const,
              onPress: () => void shareUrl(url, label).catch(() => {}),
            },
          ],
        ]
      : []),
    ...(contextActions ?? []),
  ]
  const hasMenu = !disabled && menuActions.length > 0

  // A long-press menu needs non-interactive content, so the row renders as a
  // plain View inside ContextMenu, which owns both the tap and the long press.
  const withMenu = (row: React.ReactElement, hoverRadius?: number) => (
    <ContextMenu
      accessibilityLabel={label}
      hoverRadius={hoverRadius}
      onPress={() => {
        Haptics.light()
        onPress?.()
      }}
      actions={menuActions}
    >
      {row}
    </ContextMenu>
  )

  if (layout === 'drawer') {
    const drawerRowStyle = (pressed: boolean): StyleProp<ViewStyle> => [
      {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: drawerLayout.rowMinHeight,
        paddingHorizontal: drawerLayout.horizontalPadding,
        paddingVertical: drawerLayout.rowPaddingVertical,
        gap: drawerLayout.labelGap,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor:
          pressed || selected ? theme.colors.card : 'transparent',
        opacity: disabled ? 0.4 : 1,
      },
      style,
    ]
    const drawerContent = (
      <>
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
              fontSize: theme.fontSize('md'),
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
      </>
    )

    if (hasMenu) {
      return withMenu(
        <View style={drawerRowStyle(false)}>{drawerContent}</View>,
        theme.numbers.borderRadiusLg
      )
    }

    return (
      <PointerHover enabled={!disabled} onHoverChange={setHovered}>
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!disabled, selected: !!selected }}
          disabled={disabled}
          onPress={() => {
            Haptics.light()
            onPress?.()
          }}
          style={({ pressed }) => drawerRowStyle(pressed)}
        >
          {drawerContent}
          <HoverTint
            visible={hovered && !disabled}
            borderRadius={theme.numbers.borderRadiusLg}
          />
        </Pressable>
      </PointerHover>
    )
  }

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
              fontSize: theme.fontSize('md'),
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
      <View
        pointerEvents={hasMenu ? 'none' : undefined}
        style={{ flexShrink: 0, alignItems: 'flex-end' }}
      >
        {children}
      </View>
    </>
  )

  if (hasMenu) return withMenu(<View style={rowStyle}>{content}</View>)

  return (
    <Button noTransform disabled={disabled} style={rowStyle} onPress={onPress}>
      {content}
    </Button>
  )
}

export default InputRowButton
