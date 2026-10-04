import type { ReactElement, ReactNode } from 'react'
import {
  StyleSheet,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { useToastController } from '@tamagui/toast'

import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'

/**
 * Builds a Copy menu item: copies the text, confirms with a haptic and a
 * "Copied!" toast. For menus that mix Copy with other actions in a specific
 * order (e.g. Call, Message, Copy).
 */
export function useCopyAction() {
  const toast = useToastController()

  return (
    text: string,
    {
      id = 'copy',
      title = i18n.t('copy'),
    }: { id?: string; title?: string } = {}
  ): ContextMenuAction => ({
    id,
    title,
    systemImage: 'doc.on.doc',
    onPress: () => {
      void Clipboard.setStringAsync(text).then(
        () => {
          Haptics.success().catch(() => {})
          toast.show(i18n.t('copied'), { native: true, duration: 2000 })
        },
        () => {
          Haptics.error().catch(() => {})
        }
      )
    },
  })
}

/**
 * Breathing room for content that iOS lifts out on long press: the lifted view
 * is exactly the trigger, so text flush with its edges gets clipped. `inset`
 * pads the content and `outset` (on the `ContextMenu`) cancels it with equal
 * negative margins, so the resting layout doesn't move.
 */
export const liftedContent = StyleSheet.create({
  outset: { marginHorizontal: -8, marginVertical: -4 },
  inset: { paddingHorizontal: 8, paddingVertical: 4 },
})

interface Props {
  children: ReactNode
  /**
   * Props for the Text rendered when `children` is a string. Press handlers
   * belong on `onPress`: the content stays non-interactive so the long press
   * reaches the menu.
   */
  textProps?: Omit<TextProps, 'onPress' | 'onLongPress'>
  /** What Copy puts on the clipboard. Defaults to string `children`. */
  text?: string
  /** Tap action, e.g. call a phone number. */
  onPress?: () => void
  /** Extra menu items after Copy, e.g. Navigate for an address. */
  actions?: ContextMenuEntries
  accessibilityLabel?: string
  preview?: ReactElement
  /** Outer style. Its margins replace the lift padding's negative margins. */
  style?: StyleProp<ViewStyle>
}

/**
 * Text (or content) whose long-press menu offers Copy, plus any caller actions.
 * Built on `ContextMenu`, so it must not sit inside another `ContextMenu` —
 * fold a Copy item into that menu instead (`useCopyAction`).
 */
const Copyeable = ({
  children,
  textProps,
  text,
  onPress,
  actions = [],
  accessibilityLabel,
  preview,
  style,
}: Props) => {
  const copyAction = useCopyAction()
  const copyText = text ?? (typeof children === 'string' ? children : '')

  return (
    <ContextMenu
      actions={[[copyText ? copyAction(copyText) : null], ...actions]}
      onPress={onPress}
      accessibilityLabel={
        accessibilityLabel ??
        (typeof children === 'string' ? children : undefined)
      }
      preview={preview}
      style={[liftedContent.outset, style]}
    >
      <View style={liftedContent.inset}>
        {typeof children === 'string' ? (
          <Text {...textProps}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </ContextMenu>
  )
}

export default Copyeable
