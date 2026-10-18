import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { useTabBarVisibility } from '@/stores/tabBarVisibility'

/**
 * Hides the floating tab bar while `hide` is true and this screen is focused.
 * Leaving the screen (a tab switch, a pushed screen or a sheet) brings it
 * back.
 */
export default function useHideTabBar(hide: boolean) {
  const isFocused = useIsFocused()

  useEffect(() => {
    if (!hide || !isFocused) return
    return useTabBarVisibility.getState().claim()
  }, [hide, isFocused])
}
