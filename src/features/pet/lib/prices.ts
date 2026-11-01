import type { RoomItemId } from '@/types/pet'

export const ITEM_PRICES: Readonly<Partial<Record<RoomItemId, number>>> = {
  'bed:hay': 10,
  'wallColor:sage': 10,
  'shelf:books': 12,
  'lamp:lantern': 12,
  'floor:stone': 14,
  'wallPattern:stripes': 14,
  'bed:basket': 16,
  'wallColor:sky': 16,
  'shelf:pottery': 18,
  'lamp:candle': 18,
  'floor:brick': 20,
  'wallPattern:trellis': 22,
  'bed:cushion': 22,
  'wallColor:rose': 24,
  'shelf:fruit': 26,
  'lamp:stand': 28,
  'floor:tile': 30,
  'hat:bow': 10,
  'hat:cap': 12,
  'hat:beanie': 14,
  'hat:flowers': 16,
  'hat:bucket': 18,
  'hat:beret': 20,
  'hat:sunhat': 22,
  'hat:hardhat': 24,
  'hat:fedora': 26,
  'hat:cowboy': 30,
  'hat:safari': 32,
  'hat:tophat': 36,
}

export const priceOf = (item: string): number | null =>
  ITEM_PRICES[item as RoomItemId] ?? null
