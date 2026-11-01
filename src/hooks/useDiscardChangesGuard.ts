import { useRef } from 'react'
import { Alert } from 'react-native'
import { useNavigation, usePreventRemove } from '@react-navigation/native'
import i18n from '@/lib/locales'

const useDiscardChangesGuard = (changed: boolean) => {
  const navigation = useNavigation()
  const leaving = useRef(false)

  usePreventRemove(changed, ({ data }) => {
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
