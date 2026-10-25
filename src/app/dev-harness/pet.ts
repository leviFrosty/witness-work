import usePet from '@/stores/pet'
import { petDisplayName } from '@/features/pet/lib/names'
import { announcePetUnlocks } from '@/features/pet/lib/unlockAnnounce'
import { usePetUnlockNews } from '@/features/pet/stores/petUnlockNews'
import type { RoomItemId } from '@/types/pet'
import { usePreferences } from '@/stores/preferences'
import {
  defaultCoatFor,
  isPetSpecies,
  SEASONS,
  TIMES_OF_DAY,
  type PetRoomSettings,
  type PetSpecies,
  type PetVisit,
  type PetVisitActivity,
} from '@/types/pet'
import { localDayKey } from '@/features/pet/lib/dayKeys'
import { forgetFoundSecrets } from '@/features/pet/lib/secrets'
import {
  usePetSession,
  type PetDevOverride,
} from '@/features/pet/stores/petSession'

const speciesOrThrow = (species: string): PetSpecies => {
  if (!isPetSpecies(species)) throw new Error(`Unknown species "${species}"`)
  return species
}

/** A made-up visiting pet for the harness. */
type DevVisitor = {
  species: PetSpecies
  coat?: string
  name?: string
  /** The buddy's name. */
  buddy?: string
  activity?: PetVisitActivity
}

const devVisit = (visitor: DevVisitor, i: number): PetVisit => ({
  inboxId: `dev-visitor-${i}`,
  buddyName: visitor.buddy ?? `Buddy ${i + 1}`,
  pet: {
    species: speciesOrThrow(visitor.species),
    coat: visitor.coat ?? defaultCoatFor(visitor.species),
    ...(visitor.name ? { name: visitor.name } : {}),
  },
  startMinutes: 540 + i * 30,
  activity: visitor.activity ?? { type: 'plan', planId: 'dev-visitor' },
})

/** Rejects a faked window the scene has no art for. */
const checkWindow = (window: PetDevOverride['window']) => {
  if (!window) return
  if (!TIMES_OF_DAY.includes(window.time))
    throw new Error(
      `Unknown time "${window.time}" (${TIMES_OF_DAY.join(', ')})`
    )
  if (!SEASONS.includes(window.season))
    throw new Error(`Unknown season "${window.season}" (${SEASONS.join(', ')})`)
}

/** Plays the entrance now if the Home card is up, else when it shows. */
function playEntranceSoon(species: PetSpecies) {
  const session = usePetSession.getState()
  session.requestEntrance(species)
  if (session.devSnapshot) session.send({ kind: 'entrance' })
}

/** Rejects a faked streak count the unlocks can't read. */
const checkStreak = (streak: PetDevOverride['streak']) => {
  if (streak === undefined) return
  if (!Number.isInteger(streak) || streak < 0)
    throw new Error(`Streak must be a whole number from 0, not "${streak}"`)
}

/** What the store holds, plus what the Home card last drew. */
function state() {
  const { pet, room } = usePet.getState()
  const session = usePetSession.getState()
  return {
    pet,
    room,
    promptDismissed: usePreferences.getState().petPromptDismissed,
    override: session.devOverride,
    pendingEntrance: session.entrance,
    unlocks: {
      // Earned room items stored on the pet; they never lock again.
      stored: pet?.earnedRoomItems ?? [],
      // `{ mode, streakKind, unlocked }` as the Home card last worked them out;
      // null while it isn't mounted.
      current: session.devSnapshot?.unlocks ?? null,
    },
    // Null while the Home card isn't mounted (no pet, or Home not rendered).
    card: session.devSnapshot,
  }
}

/**
 * `__WW_DEV__.pet` (dev builds only): set up the companion and fake any life
 * state or hidden moment on the Home card, then play its motions, so every
 * animation can be recorded. See
 * `.agents/skills/verify-witnesswork/features/pet.md`.
 */
export const petHarness = {
  /** Adopts (or replaces) the companion today, and asks for its entrance. */
  adopt: (species: string, coat?: string, name?: string) => {
    const id = speciesOrThrow(species)
    const store = usePet.getState()
    if (store.pet) store._WARNING_forceDeletePet()
    usePet.getState().adopt({
      species: id,
      coat: coat ?? defaultCoatFor(id),
      name,
      today: localDayKey(),
    })
    playEntranceSoon(id)
    return state()
  },
  /** Change Pet, with its entrance. */
  setAppearance: (species: string, coat?: string) => {
    const id = speciesOrThrow(species)
    usePet
      .getState()
      .changeAppearance({ species: id, coat: coat ?? defaultCoatFor(id) })
    playEntranceSoon(id)
    return state()
  },
  rename: (name?: string) => {
    usePet.getState().rename(name)
    return state()
  },
  /** Room choices, e.g. `{ floor: 'stone', window: { time: 'night' } }`. */
  setRoom: (partial: Partial<PetRoomSettings>) => {
    usePet.getState().updateRoom(partial)
    return state()
  },
  /** Releases the companion (and its room) everywhere, like the real action. */
  release: () => {
    usePet.getState().releaseCompanion()
    usePetSession.getState().setDevOverride(null)
    usePetSession.getState().takeEntrance()
    return state()
  },
  /** Brings the Home prompt back. */
  resetPrompt: () => {
    usePreferences.getState().set({ petPromptDismissed: false })
    return state()
  },
  /**
   * Fakes life and moments on top of the real ones, merged into any earlier
   * override: `hearts`, `dead`, `gold`, `goldStartedToday`, `rainbow`,
   * `lampLevel`, `streak` (the count room unlocks read; shown, never stored),
   * `secrets` (true opens every secret item; shown, never stored), `paradise`,
   * `star`, `gift` (`olive`… or null), `sill`, `window` (`{ time, season }`),
   * `visitors` (buddies' pets visiting in place of today's real ones: each `{
   * species, coat?, name?, buddy?, activity? }`, made-up buddies and a made-up
   * Plan filled in; `[]` for none, null for the real ones).
   */
  override: (
    patch: Omit<PetDevOverride, 'visits'> & {
      visitors?: DevVisitor[] | null
    }
  ) => {
    checkWindow(patch.window)
    checkStreak(patch.streak)
    const { visitors, ...rest } = patch
    const { devOverride, setDevOverride } = usePetSession.getState()
    setDevOverride({
      ...devOverride,
      ...rest,
      ...(visitors !== undefined && {
        visits: visitors && visitors.map(devVisit),
      }),
    })
    return state()
  },
  clearOverride: () => {
    usePetSession.getState().setDevOverride(null)
    return state()
  },
  /**
   * Plays a motion on the Home card (Home must be on screen): `cheer` is the
   * hearts-went-up burst.
   */
  play: (kind: 'entrance' | 'trick' | 'twirl' | 'wake' | 'cheer') => {
    usePetSession.getState().send({ kind })
    return kind
  },
  /** Pats the pet `count` times, 120 ms apart (15 plays the trick). */
  pat: (count = 1) => {
    usePetSession.getState().send({ kind: 'pat', count })
    return count
  },
  /** Rubs the pet every 100 ms for `ms` in one drag (2 s twirls it). */
  scrub: (ms = 3000) => {
    usePetSession.getState().send({ kind: 'scrub', ms })
    return ms
  },
  /** Lets every hidden moment send `pet_secret_found` again. */
  forgetSecrets: () => {
    forgetFoundSecrets()
    return true
  },
  /**
   * Items opening up now (`['hat:beret', 'floor:stone']`), under the action
   * rule: unlock toasts within 15 s of `noteUserAction()`, the tray otherwise.
   * Stores nothing on the pet; the news is real until settled.
   */
  unlock: (items: string[]) => {
    const pet = usePet.getState().pet
    if (!pet) throw new Error('No pet: adopt one first')
    announcePetUnlocks(items as RoomItemId[], petDisplayName(pet))
    return usePetUnlockNews.getState().unseen
  },
  /** The unlock news the tray lists, oldest first. */
  unlockNews: () => usePetUnlockNews.getState().unseen,
  state,
}
