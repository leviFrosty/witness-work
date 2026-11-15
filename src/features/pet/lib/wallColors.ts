import {
  STARTER_ROOM_ITEMS,
  WALL_COLORS,
  type PetRoomSettings,
  type WallColor,
  type WallPattern,
} from '@/types/pet'

const CURATED: Partial<Record<WallPattern, readonly WallColor[]>> = {
  clouds: [
    'sky',
    'delft',
    'glacier',
    'cream',
    'peach',
    'rose',
    'lilac',
    'indigo',
  ],
  leaves: [
    'sand',
    'turmeric',
    'terracotta',
    'paprika',
    'peach',
    'cocoa',
    'cream',
    'sage',
    'pistachio',
  ],
  mountains: [
    'sky',
    'delft',
    'glacier',
    'cream',
    'sand',
    'peach',
    'rose',
    'lilac',
    'indigo',
  ],
  aurora: [
    'indigo',
    'plum',
    'delft',
    'sky',
    'lilac',
    'seaglass',
    'glacier',
    'cream',
  ],
  waves: ['seaglass', 'sky', 'delft', 'glacier', 'indigo', 'cream', 'sand'],
  meadow: [
    'sage',
    'pistachio',
    'cream',
    'sand',
    'peach',
    'rose',
    'lilac',
    'turmeric',
  ],
  honeycomb: ['turmeric', 'sand', 'cream', 'peach', 'cocoa', 'terracotta'],
}

export const isCuratedPattern = (pattern: WallPattern): boolean =>
  CURATED[pattern] !== undefined

export const wallColorsFor = (pattern: WallPattern): readonly WallColor[] =>
  CURATED[pattern] ?? WALL_COLORS

export const fitsPattern = (pattern: WallPattern, color: WallColor): boolean =>
  wallColorsFor(pattern).includes(color)

const isStarter = (color: WallColor) =>
  (STARTER_ROOM_ITEMS as readonly string[]).includes(`wallColor:${color}`)

export function patternColor(
  room: Pick<PetRoomSettings, 'wallColor' | 'wallPattern' | 'wallColors'>,
  pattern: WallPattern,
  unlocked?: ReadonlySet<string>
): WallColor {
  if (pattern === room.wallPattern) return room.wallColor
  const remembered = room.wallColors?.[pattern]
  if (remembered && fitsPattern(pattern, remembered)) return remembered
  if (!isCuratedPattern(pattern)) return room.wallColor
  const colors = wallColorsFor(pattern)
  const owned = (color: WallColor) =>
    isStarter(color) || (unlocked?.has(`wallColor:${color}`) ?? false)
  return colors.find(owned) ?? colors[0]
}

export function wallPatch(
  room: Pick<PetRoomSettings, 'wallColor' | 'wallPattern' | 'wallColors'>,
  pattern: WallPattern,
  color: WallColor
): Pick<PetRoomSettings, 'wallColor' | 'wallPattern' | 'wallColors'> {
  return {
    wallPattern: pattern,
    wallColor: color,
    wallColors: {
      ...room.wallColors,
      [room.wallPattern]: room.wallColor,
      [pattern]: color,
    },
  }
}
