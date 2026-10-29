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

/**
 * The side padding a screen sits inside, as `paddingLeft`/`paddingRight`
 * values. A hero can pull its background out by this much with negative
 * margins, running under iPhone Duo's vertical bar as system bars expect.
 */
export const useHorizontalBleed = () => useContext(HorizontalBleedContext)

/**
 * The window's side safe areas, which the insets inside a screen no longer
 * show. A native sheet keeps its content clear of them on iPhone Duo, so
 * content sized up front has to know how much room that leaves.
 */
export function useWindowSideInsets() {
  const insets = useSafeAreaInsets()
  const outer = useContext(WindowSideInsetsContext)
  return outer ?? { left: insets.left, right: insets.right }
}

type Props = {
  children: ReactNode
  /** Sides something else already covers, such as the navigation rail. */
  covered?: 'left' | 'right' | null
  /** Fills the insets, so the vertical bar sits on the screen's own color. */
  backgroundColor?: string
  /**
   * Measures iPhone Duo's fold for the centered columns inside
   * (`useFoldColumn`). Off for a form sheet, whose wrapper has to stay
   * layout-only, and which the system keeps off the fold anyway.
   */
  measureFold?: boolean
}

/**
 * Keeps a screen clear of the side safe areas, which iPhone Duo's vertical
 * status bar takes, and tells everything inside that they're handled. Phones in
 * portrait and iPads have none, so this changes nothing there.
 */
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
  // Insets are physical; React Native mirrors left and right paddings in RTL.
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
