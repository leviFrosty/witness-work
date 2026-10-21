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

/**
 * Follows whether the screen `key` (whose navigation is `navigation`) is the
 * one showing in the selected tab, calling `onChange` with it now and on every
 * focus change. Each navigator from the screen up to the tab navigator must
 * show the route on the screen's path; those routes are read while the screen
 * is focused, since navigators don't hand out their parents' route keys.
 * Returns what stops it, or null outside a tab navigator.
 */
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

/**
 * Whether this screen is the one showing in the selected tab. Unlike
 * `useIsFocused`, a sheet over the tabs doesn't count as leaving: on iPad the
 * screen still shows around it. Always true outside a tab navigator.
 */
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
