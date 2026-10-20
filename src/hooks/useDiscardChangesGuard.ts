import { useRef } from 'react'
import { Alert } from 'react-native'
import { useNavigation, usePreventRemove } from '@react-navigation/native'
import i18n from '@/lib/locales'

/**
 * Asks before a form with changes is left: back, a back swipe, Android's back
 * button. A form with nothing changed leaves without asking.
 *
 * @returns Call it just before the form leaves on purpose, e.g. after saving or
 *   deleting, so that leaving doesn't ask.
 */
const useDiscardChangesGuard = (changed: boolean) => {
  const navigation = useNavigation()
  const leaving = useRef(false)

  usePreventRemove(changed, ({ data }) => {
    // The action is marked as asked about, so dispatching it again leaves.
    if (leaving.current) {
      navigation.dispatch(data.action)
      return
    }
    Alert.alert(i18n.t('discardChanges'), undefined, [
      { text: i18n.t('keepEditing'), style: 'cancel' },
      {
        text: i18n.t('discard'),
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ])
  })

  return () => {
    leaving.current = true
  }
}

export default useDiscardChangesGuard
