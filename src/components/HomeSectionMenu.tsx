import type { ReactElement } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useToastController } from '@tamagui/toast'

import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import i18n from '@/lib/locales'
import { type HomeScreenElementKey, usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'

type HomeSectionMenuProps = {
  section: HomeScreenElementKey
  /** The section's own actions, listed above Hide / Customize. */
  actions?: ContextMenuEntries
  children: ReactElement
  onPress?: () => void
  accessibilityLabel?: string
  accessible?: boolean
  preview?: ReactElement
  style?: StyleProp<ViewStyle>
}

/**
 * Long-press menu for a toggleable Home section, like editing the iOS Home
 * Screen: the section's own actions, then "Hide This Section" and "Customize
 * Home…". Both also live in Preferences → Home Screen.
 */
export default function HomeSectionMenu({
  section,
  actions = [],
  ...props
}: HomeSectionMenuProps) {
  const navigation = useNavigation<RootStackNavigation>()
  const toast = useToastController()

  const hide = () => {
    const { homeScreenElements, set } = usePreferences.getState()
    set({ homeScreenElements: { ...homeScreenElements, [section]: false } })
    toast.show(i18n.t('sectionHidden'), {
      message: i18n.t('sectionHidden_description'),
      native: true,
    })
  }

  return (
    <ContextMenu
      actions={[
        ...actions,
        [
          {
            id: 'hide_section',
            title: i18n.t('hideThisSection'),
            systemImage: 'eye.slash',
            onPress: hide,
          },
          {
            id: 'customize_home',
            title: i18n.t('customizeHome'),
            systemImage: 'slider.horizontal.3',
            onPress: () => navigation.navigate('PreferencesHomeScreen'),
          },
        ],
      ]}
      {...props}
    />
  )
}
