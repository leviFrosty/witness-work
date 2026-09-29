import {
  Button,
  ContextMenu as SwiftContextMenu,
  Divider,
  Host,
  Menu,
  RNHostView,
} from '@expo/ui/swift-ui'
import { Fragment, useState } from 'react'
import { Pressable, View } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import {
  isSubmenu,
  menuAccessibilityProps,
  menuGroups,
  runMenuAction,
} from '@/components/ui/menuEntries'
import type {
  ContextMenuAction,
  ContextMenuProps,
} from '@/components/ui/ContextMenu.types'

/** Native SwiftUI context menu: long-press lifts the preview above the menu. */
export default function ContextMenu({
  actions,
  analyticsSurface,
  children,
  onPress,
  accessibilityLabel,
  accessible = true,
  disabled = false,
  preview,
  style,
}: ContextMenuProps) {
  const { colorScheme } = usePreferences()
  // Hosted RN content sizes to its own content, so pass the width the
  // surrounding layout gives us down to it explicitly.
  const [width, setWidth] = useState<number>()
  // Rows mount by the hundred, so the preview renders only once a touch lands
  // on this trigger — well before the long press completes. The Preview slot
  // itself always exists so the native menu isn't rebuilt mid-gesture.
  const [armed, setArmed] = useState(false)
  const allGroups = menuGroups(actions)
  // Disabled keeps the Host mounted (see below) but offers no items, so the
  // native menu doesn't open.
  const groups = disabled ? [] : allGroups
  const a11y = accessible
    ? menuAccessibilityProps(groups, analyticsSurface)
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

  if (!allGroups.length) return <View style={style}>{trigger}</View>

  const button = (action: ContextMenuAction, key: string) => (
    <Button
      key={key}
      label={action.title}
      systemImage={action.systemImage}
      role={action.destructive ? 'destructive' : undefined}
      onPress={() => runMenuAction(action, key, analyticsSurface, 'long_press')}
    />
  )

  return (
    <View
      style={style}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {/* Without this, rows first laid out under the home indicator measure short. */}
      <Host matchContents colorScheme={colorScheme} ignoreSafeArea='all'>
        <SwiftContextMenu>
          <SwiftContextMenu.Items>
            {groups.map((group, index) => (
              <Fragment key={index}>
                {index > 0 ? <Divider /> : null}
                {group.map((item) =>
                  isSubmenu(item) ? (
                    <Menu
                      key={item.id}
                      label={item.title}
                      systemImage={item.systemImage}
                    >
                      {item.actions.map((action) =>
                        button(action, `${item.id}.${action.id}`)
                      )}
                    </Menu>
                  ) : (
                    button(item, item.id)
                  )
                )}
              </Fragment>
            ))}
          </SwiftContextMenu.Items>
          <SwiftContextMenu.Trigger>
            <RNHostView matchContents>
              <View
                style={{ width }}
                onTouchStart={
                  preview && !armed ? () => setArmed(true) : undefined
                }
              >
                {trigger}
              </View>
            </RNHostView>
          </SwiftContextMenu.Trigger>
          {preview && !disabled ? (
            <SwiftContextMenu.Preview>
              <RNHostView matchContents>
                {armed ? preview : <View />}
              </RNHostView>
            </SwiftContextMenu.Preview>
          ) : null}
        </SwiftContextMenu>
      </Host>
    </View>
  )
}
