import * as Crypto from 'expo-crypto'
import { usePreferences } from '@/stores/preferences'
import { useServiceReport } from '@/stores/serviceReport'
import type { JoinRequestInvite } from '@/features/buddies/lib/joinRequests'

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
  if (invite.skipRecurringPlanId)
    report.deleteSingleEventFromRecurringPlan(
      invite.skipRecurringPlanId,
      invite.add.date
    )
  return id
}
