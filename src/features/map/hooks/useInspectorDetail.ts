import { type RefObject, useEffect, useState } from 'react'
import { Platform, type View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { analytics } from '@/lib/analytics'
import useWebEscape from '@/features/map/hooks/useWebEscape'
import {
  MAP_CARD_OPEN_TEST_ID,
  MAP_CONTACT_DETAIL_TEST_ID,
} from '@/features/map/lib/mapTestIds'

export default function useInspectorDetail({
  contactIds,
  activeId,
  panelRef,
}: {
  contactIds: string[]
  activeId?: string
  panelRef: RefObject<View | null>
}) {
  const focused = useIsFocused()
  const [detailId, setDetailId] = useState<string | null>(null)
  const shown = detailId && contactIds.includes(detailId) ? detailId : null

  useEffect(() => {
    if (!detailId) return
    if (!contactIds.includes(detailId)) setDetailId(null)
    else if (activeId && activeId !== detailId && contactIds.includes(activeId))
      setDetailId(activeId)
  }, [activeId, contactIds, detailId])

  const focusOnWeb = (selector: string) => {
    if (Platform.OS !== 'web') return
    requestAnimationFrame(() =>
      (panelRef.current as unknown as HTMLElement | null)
        ?.querySelector<HTMLElement>(selector)
        ?.focus()
    )
  }

  const open = (id: string) => {
    setDetailId(id)
    analytics.capture('map_contact_details_opened')
    focusOnWeb(`[data-testid=${MAP_CONTACT_DETAIL_TEST_ID}] [role=button]`)
  }
  const close = () => {
    setDetailId(null)
    focusOnWeb(`[data-testid=${MAP_CARD_OPEN_TEST_ID}]`)
  }

  useWebEscape(!!shown && focused, close)

  return { detailId: shown, open, close }
}
