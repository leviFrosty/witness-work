import {
  ContextMenu as SwiftContextMenu,
  Host,
  RNHostView,
} from '@expo/ui/swift-ui'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import { isRtlLayout } from '@/lib/direction'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import MenuItems from '@/components/ui/MenuItems.ios'
import { menuAccessibilityProps, menuGroups } from '@/components/ui/menuEntries'
import type { ContextMenuProps } from '@/components/ui/ContextMenu.types'
import { useInReorderableGhost } from '@/components/ui/reorderable/context'
import useHostedContentWidth from '@/components/ui/useHostedContentWidth'

/** Native SwiftUI context menu: long-press lifts the preview above the menu. */
export default function ContextMenu({
  actions,
  children,
  onPress,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  accessible = true,
  disabled = false,
  preview,
  pointerEffect = 'tint',
  hoverRadius,
  fitContent = false,
  hosted = false,
  style,
  testID,
}: ContextMenuProps) {
  const colorScheme = usePreferences((s) => s.colorScheme)
  const { width, overflowed, onLayout, onContentLayout } =
    useHostedContentWidth(fitContent)
  // Rows mount by the hundred, so the preview renders only once a touch lands
  // on this trigger — well before the long press completes. The Preview slot
  // itself always exists so the native menu isn't rebuilt mid-gesture.
  const [armed, setArmed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const tint = onPress && pointerEffect === 'tint'
  // The dragged copy of a rearranged section draws without the native host.
  const ghost = useInReorderableGhost()
  const allGroups = ghost ? [] : menuGroups(actions)
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
      // Not an element when its content holds the controls, so no role: it
      // would otherwise surface as an empty button around them.
      accessibilityRole={accessible ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      testID={testID}
      {...a11y}
    >
      {children}
    </Pressable>
  ) : (
    <View
      accessible={accessible && groups.length > 0}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      {...a11y}
    >
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
              onLayout={onContentLayout}
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
    <View style={style} onLayout={onLayout}>
      {/* Without this, rows first laid out under the home indicator measure short. */}
      <Host
        // Hosted content keeps the layout of its first pass in a right-to-left
        // layout, or when it ran wider than the width, measured before the
        // width arrived; remount it at the width.
        key={isRtlLayout() || overflowed ? width : undefined}
        matchContents
        colorScheme={colorScheme}
        ignoreSafeArea='all'
      >
        {menu}
      </Host>
    </View>
  )
}
