import { useRef, useState } from 'react'
import { analytics } from '@/lib/analytics'
import type { ConversationIndex } from '@/lib/conversationIndex'
import useMapLasso from '@/features/map/hooks/useMapLasso'
import { contactUrgency } from '@/features/map/lib/contactPins'
import type { MapProjection } from '@/features/map/lib/mapPinLayout'
import {
  addPicks,
  picksInView,
  stopCountBucket,
  togglePicks,
} from '@/features/map/lib/mapSelection'
import { contactsInLoop } from '@/features/map/lib/pinGeometry'
import type { ContactMarker, MapRouteActions } from '@/features/map/types/map'

/**
 * The Map's Select mode: Contacts picked by tapping pins or drawing a loop
 * around them, and Plan Route to take them to today's route. Only picks on the
 * map now count, show and plan.
 */
export default function useMapSelection({
  contacts,
  projection,
  index,
  routeActions,
  onStart,
}: {
  /** The Contacts on the map now, after the search and the filters. */
  contacts: ContactMarker[]
  projection: MapProjection | null
  index: ConversationIndex
  routeActions: MapRouteActions | undefined
  /** Select mode is starting: put away what it replaces. */
  onStart: () => void
}) {
  const [selecting, setSelecting] = useState(false)
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const usedLasso = useRef(false)
  const picked = picksInView(pickedIds, contacts)
  const onRoute = routeActions?.todayContactIds
  const newCount = onRoute
    ? [...picked].filter((id) => !onRoute.has(id)).length
    : picked.size

  const add = (ids: string[]) =>
    setPickedIds((current) => addPicks(current, ids))
  const toggle = (ids: string[]) =>
    setPickedIds((current) => togglePicks(current, ids))
  const clear = () => setPickedIds([])

  const lasso = useMapLasso({
    enabled: selecting,
    onFinish: (loop) => {
      if (!projection) return
      const inside = contactsInLoop(contacts, loop, projection.project)
      if (inside.length === 0) return
      usedLasso.current = true
      add(inside)
    },
  })

  const start = () => {
    onStart()
    setPickedIds([])
    usedLasso.current = false
    setSelecting(true)
    analytics.capture('map_select_started')
  }

  const stop = () => {
    setSelecting(false)
    setPickedIds([])
  }

  /** Opens today's route with the picks added, the most pressing first. */
  const planRoute = () => {
    if (!routeActions) return
    const ids = contacts
      .filter((contact) => picked.has(contact.id))
      .map((contact) => ({
        id: contact.id,
        urgency: contactUrgency(contact, index, index.nowMs),
      }))
      .sort((a, b) => a.urgency - b.urgency)
      .map(({ id }) => id)
    analytics.capture('map_selection_route_planned', {
      stop_count: stopCountBucket(ids.length),
      lasso: usedLasso.current,
      supporter: routeActions.supporter,
    })
    stop()
    routeActions.planRoute(ids)
  }

  return {
    selecting,
    /** Picks on the map now; null outside Select mode. */
    picked: selecting ? picked : null,
    /** Picks not on today's route yet. */
    newCount,
    add,
    toggle,
    clear,
    start,
    stop,
    planRoute,
    lasso,
  }
}
