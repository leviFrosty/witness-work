import { useEffect, useEffectEvent, useState } from 'react'
import { AppState, Platform } from 'react-native'
import Haptics from '@/lib/haptics'
import { openAppSettings } from '@/lib/openAppSettings'
import type { Coordinate } from '@/types/contact'
import {
  askDoorLocation,
  currentDoorCoordinate,
  doorLocationAccess,
  type DoorLocationAccess,
} from '@/features/territories/lib/doorLocation'
import {
  autoPinDoor,
  awayFromStreet,
  doorPinState,
} from '@/features/territories/lib/doorPins'
import { savesDoorLocations } from '@/features/territories/lib/doors'
import { useTerritories } from '@/features/territories/stores/territories'
import type { TerritoryStreet } from '@/features/territories/types/territory'

type Skipped = { label: string; coordinate: Coordinate }

const HAS_SETTINGS = Platform.select({ web: false, default: true })

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
  const [location, setLocation] = useState<DoorLocationAccess | null>(null)
  const [away, setAway] = useState(false)
  const [anyway, setAnyway] = useState(false)
  const [skipped, setSkipped] = useState<Skipped | null>(null)

  const access = location?.access ?? null
  const state = doorPinState({ on, access, away: away && !anyway })

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

  const check = () =>
    void doorLocationAccess().then((next) => {
      setLocation(next)
      if (next.access === 'granted') lookAround()
    })

  const look = useEffectEvent(check)

  useEffect(() => {
    if (on) look()
  }, [on])

  const recheck = useEffectEvent(() => {
    if (on) void doorLocationAccess().then(setLocation)
  })

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') recheck()
    })
    return () => subscription.remove()
  }, [])

  const ask = async () => {
    const { granted, canAskAgain } = await askDoorLocation()
    setLocation({ access: granted ? 'granted' : 'denied', canAskAgain })
    return granted
  }

  const allowed = async () => {
    if (access === 'granted') return true
    if (access === 'denied') return false
    const now = await doorLocationAccess()
    if (now.access === 'ask') return ask()
    setLocation(now)
    return now.access === 'granted'
  }

  const pinDoor = (label: string) => {
    if (!on || access === 'denied') return
    void allowed().then(async (granted) => {
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
    if (await allowed()) lookAround()
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

  const allowLocation = async () => {
    if (location?.canAskAgain && (await ask())) return lookAround()
    if (HAS_SETTINGS) void openAppSettings()
  }

  return {
    state,
    pinsNow: state === 'on' && access === 'granted',
    fixWith:
      state === 'away'
        ? ('pinAnyway' as const)
        : state !== 'denied'
          ? null
          : location?.canAskAgain
            ? ('allowLocation' as const)
            : HAS_SETTINGS
              ? ('openSettings' as const)
              : null,
    toggle,
    fix: () => (state === 'away' ? pinAnyway() : void allowLocation()),
    pinDoor,
  }
}
