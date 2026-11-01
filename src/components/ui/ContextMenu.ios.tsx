import {
  ContextMenu as SwiftContextMenu,
  Group,
  Host,
  RNHostView,
} from '@expo/ui/swift-ui'
import { onAppear, onDisappear } from '@expo/ui/swift-ui/modifiers'
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
  onOpenChange,
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

  const [armed, setArmed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const tint = onPress && pointerEffect === 'tint'

  const ghost = useInReorderableGhost()
  const allGroups = ghost ? [] : menuGroups(actions)

  const groups = disabled ? [] : allGroups
  const a11y = accessible
    ? menuAccessibilityProps(groups)
    : { accessible: false }

  const trigger = onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
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
          {}
          <Group
            modifiers={
              onOpenChange && [
                onAppear(() => onOpenChange(true)),
                onDisappear(() => onOpenChange(false)),
              ]
            }
          >
            <RNHostView matchContents>{armed ? preview : <View />}</RNHostView>
          </Group>
        </SwiftContextMenu.Preview>
      ) : null}
    </SwiftContextMenu>
  )

  if (hosted) return menu

  return (
    <View style={style} onLayout={onLayout}>
      {}
      <Host
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
