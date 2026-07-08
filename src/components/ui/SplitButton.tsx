import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import React, { PropsWithChildren } from 'react'
import { Pressable, View } from 'react-native'
import { MenuView, MenuAction } from '@react-native-menu/menu'

import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import Haptics from '@/lib/haptics'
import useTheme from '@/contexts/theme'
import { ThemeSizes } from '@/types/theme'

export type SplitButtonAction = {
  id: string
  title: string
  /** SF Symbol name rendered by the native menu (e.g. 'doc.on.doc'). */
  sfSymbol: string
}

type Props = {
  /** Fires when the primary (left) segment is pressed. */
  onPress: () => unknown
  /** Options shown in the native menu opened by the chevron segment. */
  actions: SplitButtonAction[]
  /**
   * Fires with the selected action's id. By convention the caller updates what
   * the primary segment does (e.g. the default submission method).
   */
  onSelectAction: (actionId: string) => void
  /** Header text shown at the top of the menu. */
  menuTitle?: string
  /** Action rendered with a checkmark (e.g. the current default). */
  selectedActionId?: string
  /**
   * Fires when the menu opens. Use it to commit or blur any active text input
   * before the menu takes over the screen.
   */
  onOpenMenu?: () => void
  /** Accessibility label for the chevron segment. */
  menuAccessibilityLabel?: string
  /**
   * Disables the primary segment only — the chevron stays interactive so the
   * user can switch to an action that is available.
   */
  disabled?: boolean
  size?: ThemeSizes
}

/**
 * Split button: a primary action on the left and a chevron segment on the right
 * that opens a native UIMenu of alternative actions.
 */
const SplitButton = ({
  onPress,
  actions,
  onSelectAction,
  menuTitle,
  selectedActionId,
  onOpenMenu,
  menuAccessibilityLabel,
  disabled,
  size = 'lg',
  children,
}: PropsWithChildren<Props>) => {
  const theme = useTheme()

  const menuActions: MenuAction[] = actions.map((action) => ({
    id: action.id,
    title: action.title,
    image: action.sfSymbol,
    state: action.id === selectedActionId ? 'on' : 'off',
  }))

  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: theme.numbers.borderRadiusSm,
        overflow: 'hidden',
      }}
    >
      <Button
        style={{
          flex: 1,
          backgroundColor: disabled
            ? theme.colors.accentAlt
            : theme.colors.accent,
          paddingVertical: 12,
          paddingHorizontal: 24,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onPress={onPress}
        disabled={disabled}
      >
        {typeof children === 'string' ? (
          <Text
            style={{
              fontSize: theme.fontSize(size),
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.bold,
            }}
          >
            {children}
          </Text>
        ) : (
          children
        )}
      </Button>
      <View
        style={{
          width: 1,
          backgroundColor: theme.colors.textInverse,
          opacity: 0.35,
        }}
      />
      <MenuView
        title={menuTitle}
        actions={menuActions}
        onOpenMenu={() => {
          Haptics.light()
          onOpenMenu?.()
        }}
        onPressAction={({ nativeEvent }) => onSelectAction(nativeEvent.event)}
        style={{ alignSelf: 'stretch' }}
      >
        <Pressable
          accessibilityRole='button'
          accessibilityLabel={menuAccessibilityLabel}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: theme.colors.accent,
            opacity: pressed ? 0.7 : 1,
            paddingVertical: 12,
            paddingHorizontal: 18,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <LucideIcon
            icon={ChevronDownIcon}
            size={14}
            style={{ color: theme.colors.textInverse }}
          />
        </Pressable>
      </MenuView>
    </View>
  )
}

export default SplitButton
