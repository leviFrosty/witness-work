import { createContext, useContext, useSyncExternalStore } from 'react'
import useSharedCars from '@/stores/sharedCars'
import {
  buildMileagePeople,
  type MileageBuddy,
  type MileagePeople,
} from '@/lib/mileage/people'

export type SharedCarsLeft = {
  notLeft: readonly { name: string }[]
}

export type MileageSharing = {
  enabled: boolean

  buddies: readonly MileageBuddy[]

  ownName: string

  sync: () => Promise<void>

  leaveAll: () => Promise<SharedCarsLeft>
}

export const NO_MILEAGE_SHARING: MileageSharing = {
  enabled: false,
  buddies: [],
  ownName: '',
  sync: async () => {},
  leaveAll: async () => ({ notLeft: [] }),
}

export const MileageSharingContext =
  createContext<MileageSharing>(NO_MILEAGE_SHARING)

export default function useMileageSharing(): MileageSharing {
  return useContext(MileageSharingContext)
}

export const currentMileagePeople = (
  buddies: readonly MileageBuddy[]
): MileagePeople => buildMileagePeople(useSharedCars.getState().cars, buddies)

export function useMileagePeople(): MileagePeople {
  const { buddies } = useMileageSharing()
  return useSyncExternalStore(useSharedCars.subscribe, () =>
    currentMileagePeople(buddies)
  )
}
