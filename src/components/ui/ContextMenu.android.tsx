import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics'
import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  RNHostView,
  Text,
} from '@expo/ui/jetpack-compose'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import type {
  ContextMenuAction,
  ContextMenuProps,
} from '@/components/ui/ContextMenu.types'

/**
 * Material dropdown menu anchored to the content, opened by long press. Android
 * has no lifted preview, so `preview` is ignored.
 */
export default function ContextMenu({
  actions,
  children,
  onPress,
  style,
}: ContextMenuProps) {
  const theme = useTheme()
  const { colorScheme } = usePreferences()
  const [expanded, setExpanded] = useState(false)
  // Hosted RN content sizes to its own content, so pass the width the
  // surrounding layout gives us down to it explicitly.
  const [width, setWidth] = useState<number>()

  const open = () => {
    void performAndroidHapticsAsync(AndroidHaptics.Long_Press)
    setExpanded(true)
  }

  const select = (action: ContextMenuAction) => {
    setExpanded(false)
    action.onPress()
  }

  if (!actions.length) {
    return onPress ? (
      <Pressable style={style} onPress={onPress} accessibilityRole='button'>
        {children}
      </Pressable>
    ) : (
      <View style={style}>{children}</View>
    )
  }

  return (
    <View
      style={style}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Host matchContents colorScheme={colorScheme}>
        <DropdownMenu
          expanded={expanded}
          onDismissRequest={() => setExpanded(false)}
          color={theme.colors.card}
        >
          <DropdownMenu.Trigger>
            <RNHostView matchContents>
              {/* Compose click modifiers never see touches on hosted RN
                  views, so the RN side owns both gestures. */}
              <Pressable
                style={{ width }}
                onPress={onPress}
                onLongPress={open}
                accessibilityRole={onPress ? 'button' : undefined}
                accessibilityActions={[{ name: 'longpress' }]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'longpress') open()
                }}
              >
                {children}
              </Pressable>
            </RNHostView>
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.id}
                enabled={!action.disabled}
                elementColors={{
                  textColor: action.destructive
                    ? theme.colors.error
                    : theme.colors.text,
                  disabledTextColor: theme.colors.textAlt,
                }}
                onClick={() => select(action)}
              >
                <DropdownMenuItem.Text>
                  <Text>{action.title}</Text>
                </DropdownMenuItem.Text>
              </DropdownMenuItem>
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  )
}
