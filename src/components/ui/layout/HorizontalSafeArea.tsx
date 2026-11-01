import { createContext, ReactNode, useContext } from 'react'
import { View } from 'react-native'
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import { FoldArea } from '@/components/ui/layout/FoldPane'
import { isRtlLayout } from '@/lib/direction'

const HorizontalBleedContext = createContext({ left: 0, right: 0 })
const WindowSideInsetsContext = createContext<{
  left: number
  right: number
} | null>(null)

export const useHorizontalBleed = () => useContext(HorizontalBleedContext)

export function useWindowSideInsets() {
  const insets = useSafeAreaInsets()
  const outer = useContext(WindowSideInsetsContext)
  return outer ?? { left: insets.left, right: insets.right }
}

type Props = {
  children: ReactNode

  covered?: 'left' | 'right' | null

  backgroundColor?: string

  measureFold?: boolean
}

export default function HorizontalSafeArea({
  children,
  covered,
  backgroundColor,
  measureFold = true,
}: Props) {
  const insets = useSafeAreaInsets()
  const windowSides = useWindowSideInsets()
  const left = covered === 'left' ? 0 : insets.left
  const right = covered === 'right' ? 0 : insets.right

  const rtl = isRtlLayout()
  const paddingLeft = rtl ? right : left
  const paddingRight = rtl ? left : right

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: left || right ? backgroundColor : undefined,
        paddingLeft,
        paddingRight,
      }}
    >
      <HorizontalBleedContext.Provider
        value={{ left: paddingLeft, right: paddingRight }}
      >
        <WindowSideInsetsContext.Provider value={windowSides}>
          <SafeAreaInsetsContext.Provider
            value={{ ...insets, left: 0, right: 0 }}
          >
            {measureFold ? <FoldArea>{children}</FoldArea> : children}
          </SafeAreaInsetsContext.Provider>
        </WindowSideInsetsContext.Provider>
      </HorizontalBleedContext.Provider>
    </View>
  )
}
