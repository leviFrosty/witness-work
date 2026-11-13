import { useEffect, useEffectEvent, useState } from 'react'
import Haptics from '@/lib/haptics'
import useLocationAccess from '@/hooks/useLocationAccess'
import type { Coordinate } from '@/types/contact'
import { currentDoorCoordinate } from '@/features/territories/lib/doorLocation'
import {
  autoPinDoor,
  awayFromStreet,
  doorPinState,
} from '@/features/territories/lib/doorPins'
import { savesDoorLocations } from '@/features/territories/lib/doors'
import { useTerritories } from '@/features/territories/stores/territories'
import type { TerritoryStreet } from '@/features/territories/types/territory'

type Skipped = { label: string; coordinate: Coordinate }

export default function useDoorPinning({
  territoryId,
  street,
  recording,
  change,
}: {
  territoryId: string
  street: TerritoryStreet | undefined
  recording: boolean
  change: (apply: (current: TerritoryStreet) => TerritoryStreet) => void
}) {
  const on = !!street && savesDoorLocations(street)
  const location = useLocationAccess({
    enabled: on && recording,
    precise: true,
  })
  const [away, setAway] = useState(false)
  const [anyway, setAnyway] = useState(false)
  const [skipped, setSkipped] = useState<Skipped | null>(null)

  const state = doorPinState({
    on,
    access: location.granted
      ? 'granted'
      : location.notice
        ? 'denied'
        : location.access === null
          ? null
          : 'ask',
    away: away && !anyway,
  })

  const isAway = (coordinate: Coordinate, door?: Skipped) => {
    if (anyway) return false
    const territory = useTerritories
      .getState()
      .territories.find((had) => had.id === territoryId)
    const latest = territory?.streets.find((had) => had.id === street?.id)
    if (!territory || !latest) return false
    const far = awayFromStreet(coordinate, territory, latest, door?.label)
    setAway(far)
    if (door) setSkipped(far ? door : null)
    return far
  }

  const lookAround = () => {
    if (!recording) return
    void currentDoorCoordinate().then(
      (coordinate) => coordinate && isAway(coordinate)
    )
  }

  const look = useEffectEvent(lookAround)

  useEffect(() => {
    if (on && location.granted) look()
  }, [on, location.granted])

  const pinDoor = (label: string) => {
    if (!on || location.notice) return
    void location.request().then(async (granted) => {
      if (!granted) return
      const coordinate = await currentDoorCoordinate()
      if (!coordinate || isAway(coordinate, { label, coordinate })) return
      change((current) => autoPinDoor(current, label, coordinate))
    })
  }

  const turnOn = async () => {
    change((current) => ({ ...current, saveLocations: true }))
    setAway(false)
    setAnyway(false)
    await location.request({ again: true })
  }

  const toggle = (value: boolean) => {
    void Haptics.light()
    if (value) return void turnOn()
    change((current) => ({ ...current, saveLocations: false }))
  }

  const pinAnyway = () => {
    setAnyway(true)
    setAway(false)
    setSkipped(null)
    const door = skipped
    if (door)
      change((current) => autoPinDoor(current, door.label, door.coordinate))
  }

  return {
    state,
    pinsNow: state === 'on' && location.granted,
    fixWith: state === 'away' ? ('pinAnyway' as const) : null,
    toggle,
    fix: pinAnyway,
    notice:
      state === 'denied' && location.access !== null
        ? {
            access: location.access,
            fix: location.fix,
            onFix: location.runFix,
          }
        : null,
    pinDoor,
  }
}
