import { type ReactNode, useEffect, useRef } from 'react'
import { View } from 'react-native'
import {
  BriefHighlightOverlay,
  useBriefHighlight,
} from '@/components/ui/BriefHighlight'
import type { SettingsSearchItemId } from '@/features/settings/lib/settingsSearch'
import useSettingsSearchTarget, {
  isSettingsSearchTargetFresh,
} from '@/features/settings/stores/settingsSearchTarget'
import { useSettingsScroll } from '@/features/settings/components/shared/SettingsScrollView'

const REVEAL_DELAY_MS = 400

export default function SettingsSearchTarget({
  id,
  borderRadius,
  children,
}: {
  id: SettingsSearchItemId
  borderRadius?: number
  children: ReactNode
}) {
  const scroll = useSettingsScroll()
  const rowRef = useRef<View>(null)
  const clear = useSettingsSearchTarget((state) => state.clear)
  const requestedAt = useSettingsSearchTarget((state) =>
    state.target?.id === id && isSettingsSearchTargetFresh(state.target)
      ? state.target.requestedAt
      : null
  )
  const { progress, play, reducedMotion } = useBriefHighlight()

  useEffect(() => {
    if (requestedAt === null) return
    const timer = setTimeout(() => {
      clear(requestedAt)
      if (rowRef.current) scroll?.reveal(rowRef.current, !reducedMotion)
      play()
    }, REVEAL_DELAY_MS)
    return () => clearTimeout(timer)
  }, [requestedAt, clear, scroll, reducedMotion, play])

  return (
    <View ref={rowRef} collapsable={false}>
      {children}
      <BriefHighlightOverlay progress={progress} borderRadius={borderRadius} />
    </View>
  )
}
