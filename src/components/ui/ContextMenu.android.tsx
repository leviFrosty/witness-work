import { Fragment, useState } from 'react'
import { Pressable, View } from 'react-native'
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics'
import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  HorizontalDivider,
  RNHostView,
  Text,
} from '@expo/ui/jetpack-compose'
import useTheme from '@/contexts/theme'
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
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'

/**
 * Material dropdown menu anchored to the content, opened by long press. Android
 * has no lifted preview, so `preview` is ignored. A submenu replaces the menu's
 * items in place, led by an item that goes back.
 */
export default function ContextMenu({
  actions,
  analyticsSurface,
  children,
  onPress,
  accessibilityLabel,
  accessible = true,
  disabled = false,
  style,
}: ContextMenuProps) {
  const theme = useTheme()
  const { colorScheme } = usePreferences()
  const [expanded, setExpanded] = useState(false)
  const [submenu, setSubmenu] = useState<ContextMenuSubmenu | null>(null)
  // Hosted RN content sizes to its own content, so pass the width the
  // surrounding layout gives us down to it explicitly.
  const [width, setWidth] = useState<number>()
  const groups = menuGroups(actions)

  const open = () => {
    void performAndroidHapticsAsync(AndroidHaptics.Long_Press)
    setSubmenu(null)
    setExpanded(true)
  }

  const close = () => {
    setExpanded(false)
    setSubmenu(null)
  }

  const select = (action: ContextMenuAction, key: string) => {
    close()
    runMenuAction(action, key, analyticsSurface, 'long_press')
  }

  if (!groups.length) {
    return onPress ? (
      <Pressable
        style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={accessibilityLabel}
      >
        {children}
      </Pressable>
    ) : (
      <View style={style}>{children}</View>
    )
  }

  const a11y =
    accessible && !disabled
      ? menuAccessibilityProps(groups, analyticsSurface)
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
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
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
              </Pressable>
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
                    () => select(action, `${submenu.id}.${action.id}`),
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
                          () => select(entry, entry.id),
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
