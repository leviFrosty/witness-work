import { useEffect } from 'react'
import { useIsFocused } from '@react-navigation/native'
import { useTabBarVisibility } from '@/stores/tabBarVisibility'

export default function useHideTabBar(hide: boolean) {
  const isFocused = useIsFocused()

  useEffect(() => {
    if (!hide || !isFocused) return
    return useTabBarVisibility.getState().claim()
  }, [hide, isFocused])
}
