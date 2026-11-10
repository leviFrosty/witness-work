import { useContext, useEffect, useRef } from 'react'
import { type GestureResponderEvent, Platform } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { registerSubmitAction } from '@/lib/submitShortcut'

const WEB_MARK = { dataSet: { submitShortcut: '' } }

export default function useSubmitAction(
  enabled: boolean,
  onPress: ((event: GestureResponderEvent) => void) | null | undefined,
  disabled: boolean
): object | undefined {
  const navigation = useContext(NavigationContext)
  const latest = useRef({ onPress, disabled })
  useEffect(() => {
    latest.current = { onPress, disabled }
  })
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return
    return registerSubmitAction({
      press: () => latest.current.onPress?.({} as GestureResponderEvent),
      disabled: () => latest.current.disabled,
      focused: () => navigation?.isFocused() ?? true,
    })
  }, [enabled, navigation])
  return enabled && Platform.OS === 'web' ? WEB_MARK : undefined
}
