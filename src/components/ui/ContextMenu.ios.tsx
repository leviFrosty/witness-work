import {
  ContextMenu as SwiftContextMenu,
  Host,
  RNHostView,
} from '@expo/ui/swift-ui'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import MenuItems from '@/components/ui/MenuItems.ios'
import { menuAccessibilityProps, menuGroups } from '@/components/ui/menuEntries'
import type { ContextMenuProps } from '@/components/ui/ContextMenu.types'

/** Native SwiftUI context menu: long-press lifts the preview above the menu. */
export default function ContextMenu({
  actions,
  children,
  onPress,
  accessibilityLabel,
  accessible = true,
  disabled = false,
  preview,
  pointerEffect = 'tint',
  hoverRadius,
  fitContent = false,
  hosted = false,
  style,
}: ContextMenuProps) {
  const colorScheme = usePreferences((s) => s.colorScheme)
  // Hosted RN content sizes to its own content, so pass the width the
  // surrounding layout gives us down to it explicitly, unless the content is
  // meant to keep its own width.
  const [width, setWidth] = useState<number>()
  // Rows mount by the hundred, so the preview renders only once a touch lands
  // on this trigger — well before the long press completes. The Preview slot
  // itself always exists so the native menu isn't rebuilt mid-gesture.
  const [armed, setArmed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const tint = onPress && pointerEffect === 'tint'
  const allGroups = menuGroups(actions)
  // Disabled keeps the Host mounted (see below) but offers no items, so the
  // native menu doesn't open.
  const groups = disabled ? [] : allGroups
  const a11y = accessible
    ? menuAccessibilityProps(groups)
    : { accessible: false }

  const trigger = onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
      accessibilityRole='button'
      accessibilityLabel={accessibilityLabel}
      {...a11y}
    >
      {children}
    </Pressable>
  ) : (
    <View accessible={accessible && groups.length > 0} {...a11y}>
      {children}
    </View>
  )

  const triggerEffect =
    onPress && pointerEffect !== 'tint' ? pointerEffect : 'none'

  if (!allGroups.length) {
    const content = (
      <PointerHover
        effect={triggerEffect}
        onHoverChange={tint ? setHovered : undefined}
      >
        <View style={[style, { borderRadius: hoverRadius }]}>
          {trigger}
          <HoverTint visible={!!tint && hovered} borderRadius={hoverRadius} />
        </View>
      </PointerHover>
    )
    return hosted ? <RNHostView matchContents>{content}</RNHostView> : content
  }

  const menu = (
    <SwiftContextMenu>
      <SwiftContextMenu.Items>
        <MenuItems groups={groups} />
      </SwiftContextMenu.Items>
      <SwiftContextMenu.Trigger>
        <RNHostView matchContents>
          <PointerHover
            effect={triggerEffect}
            onHoverChange={(next) => {
              // A secondary click never reaches onTouchStart, so a
              // hovering pointer arms the preview ahead of it.
              if (next && preview && !armed) setArmed(true)
              if (tint) setHovered(next)
            }}
          >
            <View
              style={{ width, borderRadius: hoverRadius }}
              onTouchStart={
                preview && !armed ? () => setArmed(true) : undefined
              }
            >
              {trigger}
              <HoverTint
                visible={!!tint && hovered}
                borderRadius={hoverRadius}
              />
            </View>
          </PointerHover>
        </RNHostView>
      </SwiftContextMenu.Trigger>
      {preview && !disabled ? (
        <SwiftContextMenu.Preview>
          <RNHostView matchContents>{armed ? preview : <View />}</RNHostView>
        </SwiftContextMenu.Preview>
      ) : null}
    </SwiftContextMenu>
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
      {/* Without this, rows first laid out under the home indicator measure short. */}
      <Host matchContents colorScheme={colorScheme} ignoreSafeArea='all'>
        {menu}
      </Host>
    </View>
  )
}
