import type { ReactElement } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import { useReorderableEditing } from '@/components/ui/reorderable/context'
import useHomeEditing from '@/hooks/useHomeEditing'
import { hideHomeSection } from '@/lib/homeSections'
import i18n from '@/lib/locales'
import type { HomeScreenElementKey } from '@/stores/preferences'

type HomeSectionMenuProps = {
  section: HomeScreenElementKey
  /** The section's own actions, listed above Hide / Customize. */
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
 * Screen: the section's own actions, then Edit Home Screen (which starts the
 * jiggle mode, where sections move and hide) and Hide This Section. Off while
 * Home is being edited, when holding a section lifts it instead.
 */
export default function HomeSectionMenu({
  section,
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
          {
            id: 'hide_section',
            title: i18n.t('hideThisSection'),
            systemImage: 'eye.slash',
            onPress: () => hideHomeSection(section),
          },
        ],
      ]}
      {...props}
      disabled={editing}
    />
  )
}
