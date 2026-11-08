export type HatReaction = 'pat' | 'coins'

const PAT: readonly HatReaction[] = ['pat']
const PAT_AND_COINS: readonly HatReaction[] = ['pat', 'coins']

const HAT_REACTIONS: Readonly<Record<string, readonly HatReaction[]>> = {
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
  'hat:bowl': PAT_AND_COINS,
  'hat:lighthouse': PAT_AND_COINS,
  'hat:train': PAT_AND_COINS,
  'hat:dome': PAT_AND_COINS,
  'hat:fig': PAT_AND_COINS,
}

export const hatReactions = (item: string): readonly HatReaction[] =>
  Object.hasOwn(HAT_REACTIONS, item) ? HAT_REACTIONS[item] : []
