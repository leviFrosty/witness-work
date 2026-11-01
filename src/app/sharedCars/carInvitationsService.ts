import { analytics } from '@/lib/analytics'
import { logger } from '@/lib/logger'
import { useProfile } from '@/stores/profile'
import useSharedCars from '@/stores/sharedCars'
import { useSharedCarsSession } from '@/stores/sharedCarsSession'
import {
  buddiesEngine,
  setBuddiesCarsHandler,
} from '@/features/buddies/lib/buddiesService'
import {
  currentBuddyAvatar,
  shrinkGuestAvatar,
} from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { createCarInvitations } from '@/app/sharedCars/carInvitations'
import {
  carProfileSource,
  createCarProfile,
  type CarProfileDeps,
} from '@/app/sharedCars/carProfile'
import {
  onSharedCarInviteReissued,
  onSharedCarJoinConfirmed,
  setSharedCarProfileProvider,
  sharedCarsEngine,
  sharedCarsFailureName,
} from '@/app/sharedCars/sharedCarsService'

const profileDeps: CarProfileDeps = {
  cardName: () => buddiesEngine.ownCardName(),
  inboxId: () => useBuddies.getState().registeredInboxId,
  sharesPhoto: () => useBuddies.getState().sharing.photo,
  avatar: currentBuddyAvatar,
  shrink: shrinkGuestAvatar,
}

setSharedCarProfileProvider(createCarProfile(profileDeps))

export function watchSharedCarProfile(onChange: () => void): () => void {
  let source = carProfileSource(profileDeps)
  const check = () => {
    const next = carProfileSource(profileDeps)
    if (next === source) return
    source = next
    onChange()
  }
  const buddies = useBuddies.subscribe((state, previous) => {
    if (
      state.cardName !== previous.cardName ||
      state.sharing.photo !== previous.sharing.photo ||
      state.avatarThumbnail !== previous.avatarThumbnail ||
      state.registeredInboxId !== previous.registeredInboxId
    )
      check()
  })
  const profile = useProfile.subscribe((state, previous) => {
    if (state.name !== previous.name || state.avatar !== previous.avatar)
      check()
  })
  return () => {
    buddies()
    profile()
  }
}

export const carInvitations = createCarInvitations({
  engine: sharedCarsEngine,
  buddies: buddiesEngine,
  buddiesStore: useBuddies,
  store: useSharedCars,
  running: () => useSharedCarsSession.getState().running,
  now: Date.now,
  onEvent: ({ name, ...properties }) => analytics.capture(name, properties),
  onError: (error, context) =>
    logger.warn(`[sharedCars] ${context}: ${sharedCarsFailureName(error)}`),
})

setBuddiesCarsHandler(carInvitations.buddiesHandler)
onSharedCarInviteReissued(carInvitations.handleReissue)
onSharedCarJoinConfirmed(carInvitations.handleJoinConfirmed)
