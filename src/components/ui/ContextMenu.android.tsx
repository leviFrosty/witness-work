import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { DropdownMenu, Host, RNHostView } from '@expo/ui/jetpack-compose'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import { usePreferences } from '@/stores/preferences'
import MenuItems from '@/components/ui/MenuItems.android'
import { menuAccessibilityProps, menuGroups } from '@/components/ui/menuEntries'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import type {
  ContextMenuAction,
  ContextMenuProps,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'
import { useInReorderableGhost } from '@/components/ui/reorderable/context'

/**
 * Material dropdown menu anchored to the content, opened by long press. Android
 * has no lifted preview, so `preview` is ignored.
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
  hosted = false,
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
  // The dragged copy of a rearranged section draws without the native host.
  const ghost = useInReorderableGhost()
  const groups = ghost ? [] : menuGroups(actions)
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
    const content = onPress ? (
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
    return hosted ? <RNHostView matchContents>{content}</RNHostView> : content
  }

  const a11y =
    accessible && !disabled
      ? menuAccessibilityProps(groups)
      : { accessible: false }

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
        <MenuItems
          groups={groups}
          submenu={submenu}
          onSubmenuChange={setSubmenu}
          onSelect={select}
        />
      </DropdownMenu.Items>
    </DropdownMenu>
  )

  if (hosted) return menu

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
        {menu}
      </Host>
    </View>
  )
}
