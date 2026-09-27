import {
  Button,
  ContextMenu as SwiftContextMenu,
  Host,
  RNHostView,
} from '@expo/ui/swift-ui'
import { disabled } from '@expo/ui/swift-ui/modifiers'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import type { ContextMenuProps } from '@/components/ui/ContextMenu.types'

/** Native SwiftUI context menu: long-press lifts the preview above the menu. */
export default function ContextMenu({
  actions,
  children,
  onPress,
  preview,
  style,
}: ContextMenuProps) {
  const { colorScheme } = usePreferences()
  // Hosted RN content sizes to its own content, so pass the width the
  // surrounding layout gives us down to it explicitly.
  const [width, setWidth] = useState<number>()

  const trigger = onPress ? (
    <Pressable onPress={onPress} accessibilityRole='button'>
      {children}
    </Pressable>
  ) : (
    children
  )

  if (!actions.length) return <View style={style}>{trigger}</View>

  return (
    <View
      style={style}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {/* Without this, rows first laid out under the home indicator measure short. */}
      <Host matchContents colorScheme={colorScheme} ignoreSafeArea='all'>
        <SwiftContextMenu>
          <SwiftContextMenu.Items>
            {actions.map((action) => (
              <Button
                key={action.id}
                label={action.title}
                systemImage={action.systemImage}
                role={action.destructive ? 'destructive' : undefined}
                modifiers={action.disabled ? [disabled(true)] : undefined}
                onPress={action.onPress}
              />
            ))}
          </SwiftContextMenu.Items>
          <SwiftContextMenu.Trigger>
            <RNHostView matchContents>
              <View style={{ width }}>{trigger}</View>
            </RNHostView>
          </SwiftContextMenu.Trigger>
          {preview ? (
            <SwiftContextMenu.Preview>
              <RNHostView matchContents>{preview}</RNHostView>
            </SwiftContextMenu.Preview>
          ) : null}
        </SwiftContextMenu>
      </Host>
    </View>
  )
}
