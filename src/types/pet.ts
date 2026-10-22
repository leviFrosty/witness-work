/**
 * Pet Companion data: species, coats, room options and the synced records. See
 * `docs/pet-companion.md`. Shared by the store, sync, and the pet feature's art
 * and logic, so every id list lives here once.
 *
 * Calendar days are local `YYYY-MM-DD` keys. Only `updatedAt` / `deletedAt` are
 * sync stamps.
 */

export const PET_SPECIES_IDS = ['lion', 'dog', 'cat', 'donkey', 'lamb'] as const
export type PetSpecies = (typeof PET_SPECIES_IDS)[number]
/** Alias kept for the art registry's naming. */
export type PetSpeciesId = PetSpecies

/** Every species' coats; the first is its default. */
export const PET_COAT_IDS = {
  lion: ['default'],
  dog: ['gold', 'white', 'liver', 'black'],
  cat: [
    'orange',
    'grey',
    'black',
    'white',
    'tuxedo',
    'calico',
    'siamese',
    'tortoiseshell',
  ],
  donkey: ['default'],
  lamb: ['default'],
} as const satisfies Record<PetSpecies, readonly string[]>

export type PetCoat<S extends PetSpecies = PetSpecies> =
  (typeof PET_COAT_IDS)[S][number]

export const isPetSpecies = (value: unknown): value is PetSpecies =>
  typeof value === 'string' &&
  (PET_SPECIES_IDS as readonly string[]).includes(value)

export const coatIdsFor = <S extends PetSpecies>(
  species: S
): readonly PetCoat<S>[] => PET_COAT_IDS[species] as readonly PetCoat<S>[]

export const defaultCoatFor = <S extends PetSpecies>(species: S): PetCoat<S> =>
  coatIdsFor(species)[0]

export const isValidCoat = (species: PetSpecies, coat: unknown): boolean =>
  typeof coat === 'string' &&
  (coatIdsFor(species) as readonly string[]).includes(coat)

/** `coat` when it belongs to `species`, otherwise the species' default coat. */
export const resolveCoat = (species: PetSpecies, coat: unknown): string =>
  isValidCoat(species, coat) ? (coat as string) : defaultCoatFor(species)

/** The longest name a companion can have, in characters. */
export const PET_NAME_MAX_LENGTH = 20

/** Moods from hearts (`moodOf`). */
export const PET_MOODS = [
  'happy',
  'content',
  'ok',
  'low',
  'weak',
  'nap',
  'dead',
] as const
export type PetMood = (typeof PET_MOODS)[number]
/** Short-lived moods motion plays over the hearts mood. */
export type PetTransientMood = 'joy' | 'wide'

/** Moments with a localized sound, `pet.sound.<species>.<moment>`. */
export const PET_SOUND_MOMENTS = [
  'hi',
  'pat',
  'happy',
  'ok',
  'low',
  'nap',
] as const
export type PetSoundMoment = (typeof PET_SOUND_MOMENTS)[number]

export const GIFT_KINDS = ['olive', 'fig', 'pebble', 'feather', 'lily'] as const
export type GiftKind = (typeof GIFT_KINDS)[number]

export const isGiftKind = (value: unknown): value is GiftKind =>
  typeof value === 'string' && (GIFT_KINDS as readonly string[]).includes(value)

/**
 * Past this many wakes, the ones more than `PET_WAKES_KEEP_DAYS` before the
 * newest are dropped (`keptWakes` in `src/lib/petHistory.ts`).
 */
export const PET_WAKES_KEPT = 120
export const PET_WAKES_KEEP_DAYS = 400
/** How many keepsakes a pet record keeps, the newest first. */
export const PET_KEEPSAKES_KEPT = 20

// --- Room ------------------------------------------------------------------

export const TIMES_OF_DAY = ['dawn', 'day', 'dusk', 'night'] as const
export type TimeOfDay = (typeof TIMES_OF_DAY)[number]
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type Season = (typeof SEASONS)[number]

// Secret options (`SECRET_UNLOCKS` in `src/features/pet/lib/secretUnlocks.ts`)
// come after each part's regular ones. Append only.
export const SECRET_WALL_COLORS = [
  'indigo',
  'delft',
  'turmeric',
  'terracotta',
  'pistachio',
  'lilac',
  'seaglass',
  'plum',
  'cocoa',
  'peach',
  'paprika',
  'glacier',
] as const
export const SECRET_WALL_PATTERNS = [
  'waves',
  'chevron',
  'gingham',
  'scales',
  'argyle',
  'ikat',
  'mosaic',
  'meadow',
  'honeycomb',
  'fan',
] as const
export const SECRET_FLOOR_IDS = [
  'zellige',
  'azulejo',
  'terrazzo',
  'herringbone',
  'tatami',
  'pebbles',
  'hex',
  'harlequin',
  'chocolate',
  'lilypond',
] as const
export const SECRET_BED_IDS = [
  'teacup',
  'clam',
  'rowboat',
  'donut',
  'pouf',
  'nest',
  'cheese',
  'hammock',
  'bread',
  'bathtub',
] as const
export const SECRET_SHELF_IDS = [
  'ship',
  'dala',
  'spices',
  'nesting',
  'shells',
  'abacus',
  'globe',
  'robot',
  'telescope',
  'fishbowl',
] as const
export const SECRET_LAMP_IDS = [
  'lighthouse',
  'pierced',
  'firefly',
  'mushroom',
  'pearl',
  'cactus',
  'rocket',
  'hurricane',
  'jellyfish',
  'lava',
] as const
export const SECRET_HAT_IDS = [
  'duck',
  'teapot',
  'sailboat',
  'pancakes',
  'camel',
  'pineapple',
  'nonla',
  'chullo',
  'salakot',
  'bowler',
  'straw',
  'fisherman',
  'bush',
  'tam',
] as const

export const WALL_COLORS = [
  'sand',
  'sage',
  'sky',
  'rose',
  'cream',
  ...SECRET_WALL_COLORS,
] as const
export type WallColor = (typeof WALL_COLORS)[number]
export const WALL_PATTERNS = [
  'plain',
  'dots',
  'stripes',
  'trellis',
  ...SECRET_WALL_PATTERNS,
] as const
export type WallPattern = (typeof WALL_PATTERNS)[number]
export const FLOOR_IDS = [
  'wood',
  'stone',
  'brick',
  'tile',
  ...SECRET_FLOOR_IDS,
] as const
export type FloorId = (typeof FLOOR_IDS)[number]
export const BED_IDS = [
  'rug',
  'hay',
  'basket',
  'cushion',
  ...SECRET_BED_IDS,
] as const
export type BedId = (typeof BED_IDS)[number]
export const SHELF_IDS = [
  'scrolls',
  'books',
  'pottery',
  'fruit',
  ...SECRET_SHELF_IDS,
] as const
export type ShelfId = (typeof SHELF_IDS)[number]
export const LAMP_IDS = [
  'clay',
  'lantern',
  'candle',
  'stand',
  ...SECRET_LAMP_IDS,
] as const
export type LampId = (typeof LAMP_IDS)[number]
/**
 * The pet's hats, `none` first. Worn by the pet, stored with the room's other
 * choices (`PetRoomRecord.hat`) so Decorate Room's model covers them too.
 */
export const HAT_IDS = [
  'none',
  'bow',
  'cap',
  'beanie',
  'flowers',
  'bucket',
  'beret',
  'sunhat',
  'hardhat',
  'fedora',
  'cowboy',
  'safari',
  'tophat',
  ...SECRET_HAT_IDS,
] as const
export type HatId = (typeof HAT_IDS)[number]
export const SIGN_IDS = [
  'none',
  'month',
  'year',
  'shared',
  'plan',
  'convos',
] as const
export type SignId = (typeof SIGN_IDS)[number]

export type RoomWindow = {
  time: 'live' | TimeOfDay
  season: 'live' | Season
}

/** The swappable parts with a fixed option list, by `PetRoomRecord` field. */
export const ROOM_PART_OPTIONS = {
  wallColor: WALL_COLORS,
  wallPattern: WALL_PATTERNS,
  floor: FLOOR_IDS,
  bed: BED_IDS,
  shelf: SHELF_IDS,
  lamp: LAMP_IDS,
  sign: SIGN_IDS,
  hat: HAT_IDS,
} as const

export type RoomPart = keyof typeof ROOM_PART_OPTIONS
/** The parts whose options unlock over time; window and sign are all free. */
export type UnlockableRoomPart = Exclude<RoomPart, 'sign'>
export type RoomOption<P extends RoomPart> =
  (typeof ROOM_PART_OPTIONS)[P][number]

/** One unlockable option, as `part:option` (e.g. `floor:stone`). */
export type RoomItemId = {
  [P in UnlockableRoomPart]: `${P}:${RoomOption<P>}`
}[UnlockableRoomPart]

export const roomItemId = <P extends UnlockableRoomPart>(
  part: P,
  option: RoomOption<P>
): RoomItemId => `${part}:${option}` as RoomItemId

/** Free from the start. */
export const STARTER_ROOM_ITEMS: readonly RoomItemId[] = [
  'wallColor:sand',
  'wallColor:cream',
  'wallPattern:plain',
  'wallPattern:dots',
  'floor:wood',
  'bed:rug',
  'shelf:scrolls',
  'lamp:clay',
  'hat:none',
]

/**
 * Every non-starter item, in the order they unlock: at rising Service Streak
 * counts (`STREAK_THRESHOLDS` in `src/features/pet/lib/unlocks.ts`), or one per
 * active month since adoption while the User has no streak to grow. Parts take
 * turns so each unlock changes something different. Hats have their own order,
 * {@link HAT_UNLOCK_ORDER}.
 */
export const UNLOCK_ORDER: readonly RoomItemId[] = [
  'bed:hay',
  'wallColor:sage',
  'shelf:books',
  'lamp:lantern',
  'floor:stone',
  'wallPattern:stripes',
  'bed:basket',
  'wallColor:sky',
  'shelf:pottery',
  'lamp:candle',
  'floor:brick',
  'wallPattern:trellis',
  'bed:cushion',
  'wallColor:rose',
  'shelf:fruit',
  'lamp:stand',
  'floor:tile',
]

/**
 * Every hat but `none`, in the order they unlock, on their own counts
 * (`HAT_THRESHOLDS` in `src/features/pet/lib/unlocks.ts`): three come quickly,
 * the rest take longer.
 */
export const HAT_UNLOCK_ORDER: readonly RoomItemId[] = [
  'hat:bow',
  'hat:cap',
  'hat:beanie',
  'hat:flowers',
  'hat:bucket',
  'hat:beret',
  'hat:sunhat',
  'hat:hardhat',
  'hat:fedora',
  'hat:cowboy',
  'hat:safari',
  'hat:tophat',
]

/** Every secret item, as `part:option`, part by part. */
export type SecretRoomItemId =
  | `wallColor:${(typeof SECRET_WALL_COLORS)[number]}`
  | `wallPattern:${(typeof SECRET_WALL_PATTERNS)[number]}`
  | `floor:${(typeof SECRET_FLOOR_IDS)[number]}`
  | `bed:${(typeof SECRET_BED_IDS)[number]}`
  | `shelf:${(typeof SECRET_SHELF_IDS)[number]}`
  | `lamp:${(typeof SECRET_LAMP_IDS)[number]}`
  | `hat:${(typeof SECRET_HAT_IDS)[number]}`

const secretsOf = <P extends UnlockableRoomPart>(
  part: P,
  options: readonly string[]
): SecretRoomItemId[] =>
  options.map((option) => `${part}:${option}` as SecretRoomItemId)

/**
 * The secret items: rarer options that open up on their own milestones
 * (`SECRET_UNLOCKS`), not in {@link UNLOCK_ORDER} or {@link HAT_UNLOCK_ORDER}.
 * Decorate Room shows a locked one only as a silhouette.
 */
export const SECRET_ROOM_ITEMS: readonly SecretRoomItemId[] = [
  ...secretsOf('hat', SECRET_HAT_IDS),
  ...secretsOf('wallColor', SECRET_WALL_COLORS),
  ...secretsOf('wallPattern', SECRET_WALL_PATTERNS),
  ...secretsOf('floor', SECRET_FLOOR_IDS),
  ...secretsOf('bed', SECRET_BED_IDS),
  ...secretsOf('shelf', SECRET_SHELF_IDS),
  ...secretsOf('lamp', SECRET_LAMP_IDS),
]

// --- Records ---------------------------------------------------------------

/** The one companion's fixed record id. */
export const PET_RECORD_ID = 'companion'
/** The room's fixed record id. */
export const PET_ROOM_RECORD_ID = 'room'

export type PetKeepsake = { kind: GiftKind; on: string }

export interface PetRecord {
  /** Always `PET_RECORD_ID`: one companion per User. */
  id: string
  species: PetSpecies
  /** A coat of `species`; unknown values read as the default coat. */
  coat: string
  /** User-entered, up to `PET_NAME_MAX_LENGTH` characters; never translated. */
  name?: string
  /** Local day key of the adoption. */
  adoptedOn: string
  /** Day keys of wake taps, ascending (`keptWakes`). */
  wakes: string[]
  /** Collected gifts, by gift day, newest `PET_KEEPSAKES_KEPT` kept. */
  keepsakes: PetKeepsake[]
  /**
   * Random, set at adoption, so gift days differ from pet to pet
   * (`petGiftSeed`). Absent on pets adopted before it existed; those use their
   * adoption day.
   */
  seed?: string
  /**
   * Non-starter room items and hats earned so far, once each: room items in
   * `UNLOCK_ORDER` order, then hats, secret items and ids from a newer build,
   * sorted (`keptRoomItems`), so an item never locks again. Absent on pets from
   * before it existed: none.
   */
  earnedRoomItems?: string[]
  updatedAt: number
}

/** The room's choices. Absent until first customized. */
export interface PetRoomRecord {
  /** Always `PET_ROOM_RECORD_ID`. */
  id: string
  window: RoomWindow
  wallColor: WallColor
  wallPattern: WallPattern
  floor: FloorId
  bed: BedId
  shelf: ShelfId
  lamp: LampId
  sign: SignId
  /**
   * The pet's hat. Absent on rooms from before hats (and from older builds,
   * which keep the field without knowing it): none.
   */
  hat?: HatId
  updatedAt: number
}

/** The room's choices without its record id and stamp, the hat always set. */
export type PetRoomSettings = Omit<
  PetRoomRecord,
  'id' | 'updatedAt' | 'hat'
> & {
  hat: HatId
}

export const DEFAULT_ROOM: PetRoomSettings = {
  window: { time: 'live', season: 'live' },
  wallColor: 'sand',
  wallPattern: 'plain',
  floor: 'wood',
  bed: 'rug',
  shelf: 'scrolls',
  lamp: 'clay',
  sign: 'month',
  hat: 'none',
}

/** The sign a Kingdom Publisher's room starts with (checkbox entry mode). */
export const CHECKBOX_DEFAULT_SIGN: SignId = 'shared'

/** Deletion marker for the pet or room record. */
export type PetTombstone = { id: string; deletedAt: number }

/** The pet store's synced fields, as lists so they merge by id. */
export type PetSnapshot = {
  pets: PetRecord[]
  petRooms: PetRoomRecord[]
  deletedPetRecords: PetTombstone[]
}

/** What a Buddy Card shares about the User's pet. */
export type SharedPet = { species: PetSpecies; coat: string; name?: string }
