import { Fragment, useState } from 'react'
import { Pressable, View } from 'react-native'
import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  HorizontalDivider,
  RNHostView,
  Text,
} from '@expo/ui/jetpack-compose'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import { usePreferences } from '@/stores/preferences'
import {
  isSubmenu,
  menuAccessibilityProps,
  menuGroups,
} from '@/components/ui/menuEntries'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import type {
  ContextMenuAction,
  ContextMenuProps,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'

/**
 * Material dropdown menu anchored to the content, opened by long press. Android
 * has no lifted preview, so `preview` is ignored. A submenu replaces the menu's
 * items in place, led by an item that goes back.
 */
export default function ContextMenu({
  actions,
  children,
  onPress,
  accessibilityLabel,
  accessible = true,
  disabled = false,
  pointerEffect = 'tint',
  hoverRadius,
  fitContent = false,
  style,
}: ContextMenuProps) {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const [expanded, setExpanded] = useState(false)
  const [submenu, setSubmenu] = useState<ContextMenuSubmenu | null>(null)
  // Hosted RN content sizes to its own content, so pass the width the
  // surrounding layout gives us down to it explicitly, unless the content is
  // meant to keep its own width.
  const [width, setWidth] = useState<number>()
  const groups = menuGroups(actions)
  // Android has no system pointer effects, so mouse hover always tints.
  const [hovered, setHovered] = useState(false)
  const onHoverChange =
    onPress && pointerEffect !== 'none' ? setHovered : undefined
  const tint = <HoverTint visible={hovered} borderRadius={hoverRadius} />

  const open = () => {
    void Haptics.androidLongPress()
    setSubmenu(null)
    setExpanded(true)
  }

  const close = () => {
    setExpanded(false)
    setSubmenu(null)
  }

  const select = (action: ContextMenuAction) => {
    close()
    action.onPress()
  }

  if (!groups.length) {
    return onPress ? (
      <PointerHover onHoverChange={onHoverChange}>
        <Pressable
          style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
          onPress={onPress}
          accessibilityRole='button'
          accessibilityLabel={accessibilityLabel}
        >
          {children}
          {tint}
        </Pressable>
      </PointerHover>
    ) : (
      <View style={style}>{children}</View>
    )
  }

  const a11y =
    accessible && !disabled
      ? menuAccessibilityProps(groups)
      : { accessible: false }

  const item = (
    key: string,
    title: string,
    onClick: () => void,
    destructive?: boolean
  ) => (
    <DropdownMenuItem
      key={key}
      elementColors={{
        textColor: destructive ? theme.colors.error : theme.colors.text,
      }}
      onClick={onClick}
    >
      <DropdownMenuItem.Text>
        <Text>{title}</Text>
      </DropdownMenuItem.Text>
    </DropdownMenuItem>
  )

  return (
    <View
      style={style}
      onLayout={
        fitContent
          ? undefined
          : (event) => setWidth(event.nativeEvent.layout.width)
      }
    >
      <Host matchContents colorScheme={colorScheme}>
        <DropdownMenu
          expanded={expanded}
          onDismissRequest={close}
          color={theme.colors.card}
        >
          <DropdownMenu.Trigger>
            <RNHostView matchContents>
              {/* Compose click modifiers never see touches on hosted RN
                  views, so the RN side owns both gestures. */}
              <PointerHover onHoverChange={onHoverChange}>
                <Pressable
                  style={({ pressed }) => [
                    { width },
                    pressed && onPress ? { opacity: 0.7 } : null,
                  ]}
                  onPress={onPress}
                  onLongPress={disabled ? undefined : open}
                  accessibilityRole={onPress ? 'button' : undefined}
                  accessibilityLabel={accessibilityLabel}
                  {...a11y}
                >
                  {children}
                  {tint}
                </Pressable>
              </PointerHover>
            </RNHostView>
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            {submenu ? (
              <>
                {item('back', `‹  ${submenu.title}`, () => setSubmenu(null))}
                <HorizontalDivider color={theme.colors.border} />
                {submenu.actions.map((action) =>
                  item(
                    action.id,
                    action.title,
                    () => select(action),
                    action.destructive
                  )
                )}
              </>
            ) : (
              groups.map((group, index) => (
                <Fragment key={index}>
                  {index > 0 ? (
                    <HorizontalDivider color={theme.colors.border} />
                  ) : null}
                  {group.map((entry) =>
                    isSubmenu(entry)
                      ? item(entry.id, `${entry.title}  ›`, () =>
                          setSubmenu(entry)
                        )
                      : item(
                          entry.id,
                          entry.title,
                          () => select(entry),
                          entry.destructive
                        )
                  )}
                </Fragment>
              ))
            )}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  )
}
