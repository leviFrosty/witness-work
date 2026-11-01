import type { ReactElement, ReactNode } from 'react'
import {
  type AccessibilityRole,
  StyleSheet,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { toast } from '@/stores/toasts'

import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'

export function useCopyAction() {
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
          toast.success(i18n.t('copied'), { durationMs: 2000 })
        },
        () => {
          Haptics.error().catch(() => {})
        }
      )
    },
  })
}

export const liftedContent = StyleSheet.create({
  outset: { marginHorizontal: -8, marginVertical: -4 },
  inset: { paddingHorizontal: 8, paddingVertical: 4 },
})

interface Props {
  children: ReactNode

  textProps?: Omit<TextProps, 'onPress' | 'onLongPress'>

  text?: string

  onPress?: () => void

  actions?: ContextMenuEntries
  accessibilityLabel?: string

  accessibilityRole?: AccessibilityRole
  preview?: ReactElement

  style?: StyleProp<ViewStyle>
}

const Copyeable = ({
  children,
  textProps,
  text,
  onPress,
  actions = [],
  accessibilityLabel,
  accessibilityRole,
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
      accessibilityRole={accessibilityRole}
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
