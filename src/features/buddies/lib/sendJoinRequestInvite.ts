import * as Crypto from 'expo-crypto'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import type { JoinRequestInvite } from '@/features/buddies/lib/joinRequests'

/**
 * Invite answers a request to join in place: the buddy is added to the Plan,
 * which shares it with them like saving it from the Plan's screen would.
 * Returns the id of the one-time Plan that now carries the invitation.
 */
export default function sendJoinRequestInvite(
  invite: Extract<JoinRequestInvite, { kind: 'invite' }>
): string {
  const report = useServiceReport.getState()
  if ('update' in invite) {
    report.updateDayPlan(invite.update)
    return invite.update.id
  }
  const id = Crypto.randomUUID()
  report.addDayPlan({
    ...invite.add,
    id,
    notifyMe: usePreferences.getState().planAlwaysNotify,
  })
  return id
}
