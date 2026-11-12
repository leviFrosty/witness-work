import type { TerritorySpace } from '@/features/territories/types/sharedTerritory'

export const emptySpace = (
  spaceId: string,
  fields: Partial<TerritorySpace> &
    Pick<TerritorySpace, 'territoryId' | 'myMemberId'>
): TerritorySpace => ({
  spaceId,
  ownerId: '',
  epoch: 1,
  seq: 0,
  rekeyNeeded: false,
  members: [],
  invites: [],
  holders: [],
  links: [],
  records: {},
  pending: [],
  sealed: [],
  unread: [],
  keyChain: [],
  keyStamps: {},
  ownRecordChecked: false,
  sentInvites: {},
  guestKeyEpochs: {},
  local: { next: {} },
  hadOthers: false,
  ...fields,
})
