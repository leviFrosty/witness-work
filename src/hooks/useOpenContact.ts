import {
  CommonActions,
  StackActions,
  useNavigation,
  type NavigationAction,
} from '@react-navigation/native'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { isContactDismissed } from '@/lib/dismissedContacts'
import useContacts from '@/stores/contactsStore'
import { usePreferences } from '@/stores/preferences'
import type { RootStackParamList } from '@/types/rootStack'

type ContactDetailsParams = RootStackParamList['Contact Details']

export type OpenContactMode = 'navigate' | 'push' | 'replace'

export function useContactsSplit() {
  const { isWide, hasSidebar } = useAdaptiveLayout()
  const contactsView = usePreferences((s) => s.contactsView)
  return isWide && (hasSidebar || contactsView !== 'map')
}

type Navigator = {
  dispatch: (action: NavigationAction) => void
  getState: () => { index: number } | undefined
  getParent?: () => Navigator | undefined
}

const rootOf = (navigation: Navigator) => {
  let root = navigation
  for (let parent = root.getParent?.(); parent; parent = root.getParent?.())
    root = parent
  return root
}

export function openContactDetails(
  navigation: Navigator,
  params: ContactDetailsParams,
  { split, mode = 'navigate' }: { split: boolean; mode?: OpenContactMode }
) {
  const contact = useContacts
    .getState()
    .contacts.find((c) => c.id === params.id)
  if (split && contact && !isContactDismissed(contact)) {
    const root = rootOf(navigation)
    const showInSplit = CommonActions.navigate('Root', {
      screen: 'Contacts',
      params: {
        contactId: params.id,
        highlightedVisitId: params.highlightedVisitId,
      },
    })
    if (!root.getState()?.index) {
      root.dispatch(showInSplit)
      return
    }
    root.dispatch(StackActions.popToTop())
    setTimeout(() => root.dispatch(showInSplit), 0)
    return
  }
  navigation.dispatch(
    mode === 'navigate'
      ? CommonActions.navigate('Contact Details', params)
      : mode === 'push'
        ? StackActions.push('Contact Details', params)
        : StackActions.replace('Contact Details', params)
  )
}

export default function useOpenContact() {
  const navigation = useNavigation()
  const split = useContactsSplit()
  return (params: ContactDetailsParams, mode?: OpenContactMode) =>
    openContactDetails(navigation, params, { split, mode })
}
