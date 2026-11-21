import {
  RARE_ROOM_ITEMS,
  UNCOMMON_ROOM_ITEMS,
  type RoomItemId,
} from '@/types/pet'

export const PRICE_CUT = '2026-11'

export const ITEM_PRICES: Readonly<Partial<Record<RoomItemId, number>>> = {
  'bed:hay': 30,
  'wallColor:sage': 30,
  'shelf:books': 40,
  'lamp:lantern': 40,
  'floor:stone': 40,
  'wallPattern:stripes': 40,
  'bed:basket': 50,
  'wallColor:sky': 50,
  'shelf:pottery': 50,
  'lamp:candle': 50,
  'floor:brick': 60,
  'wallPattern:trellis': 70,
  'bed:cushion': 70,
  'wallColor:rose': 70,
  'shelf:fruit': 80,
  'lamp:stand': 80,
  'floor:tile': 90,
  'shelf:hourglass': 190,
  'shelf:tea': 200,
  'wallPattern:clouds': 220,
  'floor:grass': 230,
  'bed:leafpile': 250,
  'wallPattern:leaves': 250,
  'lamp:stove': 260,
  'floor:shore': 280,
  'bed:pool': 290,
  'lamp:streetlamp': 300,
  'shelf:gramophone': 390,
  'shelf:volcano': 480,
  'wallPattern:mountains': 510,
  'bed:hotspring': 540,
  'lamp:shadows': 600,
  'floor:koi': 660,
  'bed:flowerbed': 720,
  'wallPattern:aurora': 750,
  'floor:forest': 780,
  'lamp:campfire': 840,
  'study:stool': 30,
  'study:bag': 40,
  'study:bookstand': 50,
  'study:desk': 60,
  'study:bookcase': 70,
  'study:table': 90,
  'study:armchair': 110,
  'study:rocker': 210,
  'study:typewriter': 230,
  'study:lampdesk': 420,
  'study:fort': 570,
  'hat:bow': 30,
  'hat:cap': 40,
  'hat:beanie': 40,
  'hat:flowers': 50,
  'hat:bucket': 50,
  'hat:beret': 60,
  'hat:sunhat': 70,
  'hat:hardhat': 70,
  'hat:fedora': 80,
  'hat:cowboy': 90,
  'hat:safari': 100,
  'hat:tophat': 110,
  'hat:toast': 30,
  'hat:acorn': 40,
  'hat:leaf': 40,
  'hat:box': 80,
  'hat:saucepan': 100,
  'hat:toque': 110,
  'hat:cone': 120,
  'hat:melon': 130,
  'hat:umbrella': 140,
  'hat:books': 160,
  'hat:dropped': 170,
  'hat:propeller': 190,
  'hat:snail': 200,
  'hat:mailbox': 200,
  'hat:nest': 220,
  'hat:frog': 230,
  'hat:hive': 240,
  'hat:cottage': 260,
  'hat:cloud': 270,
  'hat:cuckoo': 280,
  'hat:mini': 300,
  'hat:balloon': 330,
  'hat:bowl': 360,
  'hat:carousel': 480,
  'hat:fig': 540,
  'hat:train': 600,
  'hat:dome': 780,
  'hat:meadow': 960,
}

export const priceOf = (item: string): number | null =>
  ITEM_PRICES[item as RoomItemId] ?? null

export type ItemRarity = 'common' | 'uncommon' | 'rare'

const RARE_ITEMS: ReadonlySet<string> = new Set(RARE_ROOM_ITEMS)

const UNCOMMON_ITEMS: ReadonlySet<string> = new Set(UNCOMMON_ROOM_ITEMS)

export const itemRarity = (item: string): ItemRarity =>
  RARE_ITEMS.has(item)
    ? 'rare'
    : UNCOMMON_ITEMS.has(item)
      ? 'uncommon'
      : 'common'
