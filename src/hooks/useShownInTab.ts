import { useEffect, useState } from 'react'
import {
  type NavigationProp,
  type ParamListBase,
  useNavigation,
  useRoute,
} from '@react-navigation/native'

type Navigation = Pick<
  NavigationProp<ParamListBase>,
  'getState' | 'getParent' | 'isFocused' | 'addListener'
>

const currentKey = (navigation: Navigation) => {
  const state = navigation.getState()
  return state?.routes[state.index]?.key
}

export function followShownInTab(
  navigation: Navigation,
  key: string,
  onChange: (shown: boolean) => void
): (() => void) | null {
  const levels: { navigation: Navigation; key?: string }[] = []
  let level: Navigation | undefined = navigation
  while (level) {
    levels.push({ navigation: level })
    if (level.getState()?.type === 'tab') break
    level = level.getParent()
  }
  if (!level) return null
  levels[0].key = key

  const update = () => {
    if (navigation.isFocused())
      levels.forEach((entry) => (entry.key = currentKey(entry.navigation)))
    onChange(
      levels.every(
        (entry) =>
          entry.key !== undefined && currentKey(entry.navigation) === entry.key
      )
    )
  }
  update()
  const unsubscribe = [
    navigation.addListener('focus', update),
    navigation.addListener('blur', update),
  ]
  return () => unsubscribe.forEach((remove) => remove())
}

export default function useShownInTab(): boolean {
  const navigation = useNavigation<NavigationProp<ParamListBase>>()
  const { key } = useRoute()
  const [shown, setShown] = useState(true)

  useEffect(
    () => followShownInTab(navigation, key, setShown) ?? undefined,
    [navigation, key]
  )

  return shown
}
