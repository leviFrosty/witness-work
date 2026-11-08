import { RARE_HAT_IDS, UNCOMMON_HAT_IDS, type RoomItemId } from '@/types/pet'

export const ITEM_PRICES: Readonly<Partial<Record<RoomItemId, number>>> = {
  'bed:hay': 100,
  'wallColor:sage': 100,
  'shelf:books': 120,
  'lamp:lantern': 120,
  'floor:stone': 140,
  'wallPattern:stripes': 140,
  'bed:basket': 160,
  'wallColor:sky': 160,
  'shelf:pottery': 180,
  'lamp:candle': 180,
  'floor:brick': 200,
  'wallPattern:trellis': 220,
  'bed:cushion': 220,
  'wallColor:rose': 240,
  'shelf:fruit': 260,
  'lamp:stand': 280,
  'floor:tile': 300,
  'study:stool': 100,
  'study:bag': 120,
  'study:bookstand': 160,
  'study:desk': 200,
  'study:bookcase': 240,
  'study:table': 300,
  'study:armchair': 360,
  'hat:bow': 100,
  'hat:cap': 120,
  'hat:beanie': 140,
  'hat:flowers': 160,
  'hat:bucket': 180,
  'hat:beret': 200,
  'hat:sunhat': 220,
  'hat:hardhat': 240,
  'hat:fedora': 260,
  'hat:cowboy': 300,
  'hat:safari': 320,
  'hat:tophat': 360,
  'hat:toast': 110,
  'hat:acorn': 130,
  'hat:leaf': 150,
  'hat:box': 280,
  'hat:saucepan': 340,
  'hat:toque': 380,
  'hat:cone': 400,
  'hat:melon': 440,
  'hat:umbrella': 480,
  'hat:books': 520,
  'hat:dropped': 560,
  'hat:propeller': 620,
  'hat:snail': 650,
  'hat:mailbox': 680,
  'hat:nest': 720,
  'hat:frog': 760,
  'hat:hive': 800,
  'hat:cottage': 860,
  'hat:cloud': 900,
  'hat:cuckoo': 950,
  'hat:mini': 1000,
  'hat:balloon': 1100,
  'hat:bowl': 1200,
  'hat:lighthouse': 1600,
  'hat:train': 2000,
  'hat:dome': 2600,
  'hat:fig': 3200,
}

export const priceOf = (item: string): number | null =>
  ITEM_PRICES[item as RoomItemId] ?? null

export type ItemRarity = 'common' | 'uncommon' | 'rare'

const RARE_ITEMS: ReadonlySet<string> = new Set(
  RARE_HAT_IDS.map((hat) => `hat:${hat}`)
)

const UNCOMMON_ITEMS: ReadonlySet<string> = new Set(
  UNCOMMON_HAT_IDS.map((hat) => `hat:${hat}`)
)

export const itemRarity = (item: string): ItemRarity =>
  RARE_ITEMS.has(item)
    ? 'rare'
    : UNCOMMON_ITEMS.has(item)
      ? 'uncommon'
      : 'common'
