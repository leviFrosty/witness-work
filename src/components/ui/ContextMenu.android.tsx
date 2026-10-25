import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { DropdownMenu, Host, RNHostView } from '@expo/ui/jetpack-compose'
import { fillMaxSize } from '@expo/ui/jetpack-compose/modifiers'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import { usePreferences } from '@/stores/preferences'
import MenuItems from '@/components/ui/MenuItems.android'
import { menuAccessibilityProps, menuGroups } from '@/components/ui/menuEntries'
import { transparentToScreenReaders } from '@/lib/screenReader'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import type {
  ContextMenuAction,
  ContextMenuProps,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'
import { useInReorderableGhost } from '@/components/ui/reorderable/context'
import useHostedContentWidth from '@/components/ui/useHostedContentWidth'

/**
 * Material dropdown menu anchored to the content, opened by long press. Android
 * has no lifted preview, so `preview` is ignored.
 */
export default function ContextMenu({
  actions,
  children,
  onPress,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  accessible = true,
  disabled = false,
  pointerEffect = 'tint',
  hoverRadius,
  fitContent = false,
  hosted = false,
  style,
  testID,
  deferHost = false,
  onOpenChange,
}: ContextMenuProps) {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const [expanded, setExpanded] = useState(false)
  const [submenu, setSubmenu] = useState<ContextMenuSubmenu | null>(null)
  // Hosted RN content sizes to its own content, so pass the width the
  // surrounding layout gives us down to it explicitly, unless the content is
  // meant to keep its own width.
  const { width, overflowed, onLayout, onContentLayout } =
    useHostedContentWidth(fitContent)
  // The dragged copy of a rearranged section draws without the native host.
  const ghost = useInReorderableGhost()
  const groups = ghost ? [] : menuGroups(actions)
  // Android has no system pointer effects, so mouse hover always tints.
  const [hovered, setHovered] = useState(false)
  const onHoverChange =
    onPress && pointerEffect !== 'none' ? setHovered : undefined
  const tint = <HoverTint visible={hovered} borderRadius={hoverRadius} />

  // With `deferHost`, whether the first long press has mounted the host.
  const [hostMounted, setHostMounted] = useState(false)

  const open = () => {
    setHostMounted(true)
    void Haptics.androidLongPress()
    setSubmenu(null)
    setExpanded(true)
    onOpenChange?.(true)
  }

  const close = () => {
    setExpanded(false)
    setSubmenu(null)
    onOpenChange?.(false)
  }

  const select = (action: ContextMenuAction) => {
    close()
    action.onPress()
  }

  if (!groups.length) {
    const content = onPress ? (
      <PointerHover onHoverChange={onHoverChange}>
        <Pressable
          style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
          onPress={onPress}
          accessibilityRole='button'
          accessibilityLabel={accessibilityLabel}
          accessibilityState={accessibilityState}
          testID={testID}
        >
          {children}
          {tint}
        </Pressable>
      </PointerHover>
    ) : (
      <View style={style}>{children}</View>
    )
    return hosted ? <RNHostView matchContents>{content}</RNHostView> : content
  }

  // Content that holds its own controls leaves the trigger out of TalkBack
  // entirely: a focusable Pressable is an element anyway, and one that only
  // has a state still reads the content's loose text around those controls.
  const a11y = !accessible
    ? transparentToScreenReaders
    : disabled
      ? { accessible: false }
      : menuAccessibilityProps(groups)

  const items = (
    <DropdownMenu.Items>
      <MenuItems
        groups={groups}
        submenu={submenu}
        onSubmenuChange={setSubmenu}
        onSelect={select}
      />
    </DropdownMenu.Items>
  )

  if (deferHost && !hosted) {
    // The host stays mounted once it is, so the menu's exit plays out and
    // later long presses open it as fast as a host made up front would.
    return (
      <View style={style}>
        {hostMounted ? (
          // Behind the content and filling it: the menu's anchor, the same
          // rectangle a host around the content would give it.
          <Host style={StyleSheet.absoluteFill} colorScheme={colorScheme}>
            <DropdownMenu
              expanded={expanded}
              onDismissRequest={close}
              color={theme.colors.card}
              modifiers={[fillMaxSize()]}
            >
              {items}
            </DropdownMenu>
          </Host>
        ) : null}
        <PointerHover onHoverChange={onHoverChange}>
          <Pressable
            style={({ pressed }) => pressed && onPress && { opacity: 0.7 }}
            onPress={onPress}
            onLongPress={disabled ? undefined : open}
            accessibilityRole={onPress ? 'button' : accessibilityRole}
            accessibilityLabel={accessibilityLabel}
            accessibilityState={accessibilityState}
            testID={testID}
            {...a11y}
          >
            {children}
            {tint}
          </Pressable>
        </PointerHover>
      </View>
    )
  }

  const menu = (
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
              onLayout={onContentLayout}
              onPress={onPress}
              onLongPress={disabled ? undefined : open}
              accessibilityRole={onPress ? 'button' : accessibilityRole}
              accessibilityLabel={accessibilityLabel}
              accessibilityState={accessibilityState}
              testID={testID}
              {...a11y}
            >
              {children}
              {tint}
            </Pressable>
          </PointerHover>
        </RNHostView>
      </DropdownMenu.Trigger>
      {items}
    </DropdownMenu>
  )

  if (hosted) return menu

  return (
    <View style={style} onLayout={onLayout}>
      <Host
        // Content that ran wider than the width before it arrived keeps that
        // layout; remount it at the width.
        key={overflowed ? width : undefined}
        matchContents
        colorScheme={colorScheme}
      >
        {menu}
      </Host>
    </View>
  )
}
