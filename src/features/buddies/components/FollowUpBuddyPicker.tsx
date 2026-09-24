import i18n from '@/lib/locales'
import BuddyPicker from '@/features/buddies/components/BuddyPicker'
import useShareReplies from '@/features/buddies/hooks/useShareReplies'
import { followUpShareKey } from '@/features/buddies/lib/shares'

/** "Invite Buddies" for a Follow-up, with answers once it's been shared. */
export default function FollowUpBuddyPicker({
  visitId,
  value,
  onChange,
}: {
  visitId: string
  value: string[]
  onChange: (inboxIds: string[]) => void
}) {
  const replies = useShareReplies(
    value.length > 0 ? followUpShareKey(visitId) : undefined
  )
  return (
    <BuddyPicker
      value={value}
      onChange={onChange}
      description={i18n.t('buddies_inviteFollowUpDescription')}
      replies={replies}
    />
  )
}
