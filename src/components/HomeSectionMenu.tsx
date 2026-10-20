import type { ReactElement } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import { useReorderableEditing } from '@/components/ui/reorderable/context'
import useHomeEditing from '@/hooks/useHomeEditing'
import i18n from '@/lib/locales'

type HomeSectionMenuProps = {
  /** The section's own actions, listed above Edit Home Screen. */
  actions?: ContextMenuEntries
  children: ReactElement
  onPress?: () => void
  accessibilityLabel?: string
  accessible?: boolean
  preview?: ReactElement
  /** Corner radius of the hover tint; match the section's card. */
  hoverRadius?: number
  style?: StyleProp<ViewStyle>
}

/**
 * Long-press menu for a toggleable Home section, like an app's on the Home
 * Screen: the section's own actions, then Edit Home Screen, which starts the
 * jiggle mode where sections move and hide. Off while Home is being edited,
 * when holding a section lifts it instead.
 */
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
        // Its own group, below the section's actions.
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
