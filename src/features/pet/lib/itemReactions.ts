import { RARE_ROOM_ITEMS } from '@/types/pet'

export type ItemReaction = 'pat' | 'coins'

const PAT: readonly ItemReaction[] = ['pat']
const PAT_AND_COINS: readonly ItemReaction[] = ['pat', 'coins']

const ITEM_REACTIONS: Readonly<Record<string, readonly ItemReaction[]>> = {
  'hat:propeller': PAT,
  'hat:snail': PAT,
  'hat:mailbox': PAT_AND_COINS,
  'hat:nest': PAT,
  'hat:frog': PAT,
  'hat:hive': PAT,
  'hat:cloud': PAT,
  'hat:cuckoo': PAT,
  'hat:mini': PAT,
  'hat:balloon': PAT,
  ...Object.fromEntries(RARE_ROOM_ITEMS.map((item) => [item, PAT_AND_COINS])),
}

export const itemReactions = (item: string): readonly ItemReaction[] =>
  Object.hasOwn(ITEM_REACTIONS, item) ? ITEM_REACTIONS[item] : []
