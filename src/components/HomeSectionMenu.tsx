import type { ReactElement } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import { useReorderableEditing } from '@/components/ui/reorderable/context'
import useHomeEditing from '@/hooks/useHomeEditing'
import i18n from '@/lib/locales'

type HomeSectionMenuProps = {
  actions?: ContextMenuEntries
  children: ReactElement
  onPress?: () => void
  accessibilityLabel?: string
  accessible?: boolean
  preview?: ReactElement

  hoverRadius?: number
  style?: StyleProp<ViewStyle>
}

export default function HomeSectionMenu({
  actions = [],
  ...props
}: HomeSectionMenuProps) {
  const editing = useReorderableEditing()
  const { start } = useHomeEditing()

  return (
    <ContextMenu
      actions={[
        ...actions,

        [
          {
            id: 'edit_home',
            title: i18n.t('homeEdit.editHomeScreen'),
            systemImage: 'square.grid.2x2',
            onPress: () => start('menu'),
          },
        ],
      ]}
      {...props}
      disabled={editing}
    />
  )
}
