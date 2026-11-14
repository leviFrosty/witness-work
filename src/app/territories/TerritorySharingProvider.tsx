import type { ReactNode } from 'react'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { toast } from '@/stores/toasts'
import { useTerritoriesSession } from '@/stores/territoriesSession'
import { buddyProfileAvatar } from '@/features/buddies/components/BuddyAvatar'
import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'
import useBuddiesCardName from '@/features/buddies/hooks/useBuddiesCardName'
import { buddyColor } from '@/features/buddies/lib/buddyColors'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import { useBuddiesSession } from '@/features/buddies/stores/buddiesSession'
import {
  TerritorySharingContext,
  type TerritorySharing,
  type TerritorySharingActions,
} from '@/features/territories/hooks/useTerritorySharing'
import { spaceOfTerritory } from '@/features/territories/stores/territories'
import {
  SHARING_FAILURE_TEXT,
  type SharingFailure,
  sharingFailure,
} from '@/app/territories/sharingFailure'
import { startLink } from '@/app/territories/startLink'
import {
  prepareTerritoryAccount,
  territoriesEngine,
  territoriesFailureName,
  territoryInvitations,
} from '@/app/territories/territoriesService'

function failed(error: unknown, context: string): null {
  logger.warn(`[territories] ${context}: ${territoriesFailureName(error)}`)
  toast.error(i18n.t(SHARING_FAILURE_TEXT[sharingFailure(error)]))
  return null
}

const refuse = (failure: SharingFailure) => {
  toast.error(i18n.t(SHARING_FAILURE_TEXT[failure]))
  return null
}

async function attempt<T>(
  context: string,
  work: () => Promise<T>,
  { buddies = false } = {}
): Promise<T | null> {
  if (!useTerritoriesSession.getState().running) return refuse('failed')
  if (buddies && !useBuddiesSession.getState().running)
    return refuse('needsBuddies')
  try {
    return await work()
  } catch (error) {
    return failed(error, context)
  }
}

const done = async (
  context: string,
  work: () => Promise<unknown>,
  options?: { buddies?: boolean }
) =>
  (await attempt(
    context,
    async () => {
      await work()
      return true
    },
    options
  )) === true

const withBuddies = { buddies: true }

const spaceIdOf = (territoryId: string) =>
  spaceOfTerritory(territoryId)?.spaceId

const actions: TerritorySharingActions = {
  share: (territoryId, inboxIds, streetIds) =>
    done(
      'share',
      () => territoryInvitations.share(territoryId, inboxIds, streetIds),
      withBuddies
    ),
  stopSharing: (territoryId, personId) =>
    done('stop', () => territoryInvitations.stopSharing(territoryId, personId)),
  handOff: (territoryId, streetId, inboxId) =>
    done(
      'handoff',
      () => territoryInvitations.handOff(territoryId, streetId, inboxId),
      withBuddies
    ),
  endHandoff: (territoryId, streetId) =>
    done('handoff/end', () =>
      territoryInvitations.endHandoff(territoryId, streetId)
    ),
  createLink: (territoryId, streetIds, lifetimeMs) =>
    startLink(async () => {
      await prepareTerritoryAccount()
      return territoriesEngine.createLink(territoryId, streetIds, lifetimeMs)
    }),
  linkUrl: async (territoryId, linkId) => {
    const spaceId = spaceIdOf(territoryId)
    if (!spaceId) return null
    try {
      return await territoriesEngine.linkUrl(spaceId, linkId)
    } catch (error) {
      return failed(error, 'link/url')
    }
  },
  endLink: (territoryId, linkId) =>
    done('link/end', async () => {
      const spaceId = spaceIdOf(territoryId)
      if (!spaceId) throw new Error('No shared territory')
      await territoriesEngine.endLink(spaceId, linkId)
    }),
  setLinkLifetime: (territoryId, linkId, lifetimeMs) =>
    done('link/expiry', async () => {
      const spaceId = spaceIdOf(territoryId)
      if (!spaceId) throw new Error('No shared territory')
      await territoriesEngine.setLinkLifetime(spaceId, linkId, lifetimeMs)
    }),
  leave: (territoryId) =>
    done('leave', () => territoriesEngine.leaveTerritory(territoryId)),
  returnTerritory: (territoryId) =>
    done('return', () => territoriesEngine.returnTerritory(territoryId)),
  refresh: async (territoryId) => {
    const spaceId = spaceIdOf(territoryId)
    if (!spaceId || !useTerritoriesSession.getState().running) return
    await territoriesEngine
      .syncSpace(spaceId)
      .then(() => undefined)
      .catch((error: unknown) => {
        logger.warn(`[territories] refresh: ${territoriesFailureName(error)}`)
      })
  },
}

export default function TerritorySharingProvider({
  children,
}: {
  children: ReactNode
}) {
  const theme = useTheme()
  const availability = useBuddiesAvailability()
  const buddies = useBuddies((state) => state.buddies)
  const ownName = useBuddiesCardName()
  const buddiesSetUp = useBuddiesSession((state) => state.running)

  const value: TerritorySharing = {
    buddiesAvailable: availability !== 'hidden',
    buddiesSetUp,
    buddies: buddies
      .filter((buddy) => buddiesSetUp && buddy.status === 'active')
      .map((buddy) => ({
        inboxId: buddy.inboxId,
        name: buddyDisplayName(buddy),
        avatar: buddyProfileAvatar(buddy.avatar),
        color: buddyColor(theme, buddy),
      })),
    ownName,
    canOpenBuddies: availability === 'enabled',
    actions,
  }

  return (
    <TerritorySharingContext.Provider value={value}>
      {children}
    </TerritorySharingContext.Provider>
  )
}
