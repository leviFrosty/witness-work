import { View } from 'react-native'
import InfoPopover from '@/components/ui/InfoPopover'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import SegmentedControl from '@/components/ui/SegmentedControl'
import i18n from '@/lib/locales'
import type { BuddyShareRef } from '@/types/timeEntry'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import type { ShareReply } from '@/features/buddies/lib/schemas'
import type {
  IncomingShare,
  IncomingShareStatus,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import PlanDetailsBuddyRow from '@/features/plans/components/PlanDetailsBuddyRow'

/** Answering a buddy's invitation from Plan Details. */
export type ShareAnswering = {
  busy: boolean
  answer: (share: BuddyShareRef, reply: ShareReply) => void
}

/**
 * A buddy's Plan invitation: who organized it, and (while it can still be
 * answered) the User's answer as two side-by-side choices, so switching back is
 * one tap either way.
 */
export default function PlanDetailsInvitation({
  from,
  share,
  status,
  answering,
}: {
  /** The organizer's inbox id. */
  from: string
  share?: IncomingShare
  status: Exclude<IncomingShareStatus, 'cancelled'>
  answering: ShareAnswering
}) {
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === from)
  )
  if (!buddy) return null
  const name = buddyDisplayName(buddy)

  return (
    <BuddiesSection title={i18n.t('buddies_title')}>
      <PlanDetailsBuddyRow
        buddy={buddy}
        subtitle={i18n.t('planDetails_organizer')}
        action={
          <InfoPopover
            title={name}
            description={i18n.t('buddies_sharedBy', { name })}
          />
        }
        last={!share}
      />
      {share ? (
        <InputRowContainer
          label={i18n.t('planDetails_yourAnswer')}
          controlWidth='full'
          lastInSection
        >
          <View pointerEvents={answering.busy ? 'none' : 'auto'}>
            <SegmentedControl<ShareReply>
              variant='pill'
              options={[
                { key: 'going', label: i18n.t('buddies_going') },
                { key: 'declined', label: i18n.t('buddies_cantMakeIt') },
              ]}
              value={status === 'pending' ? null : status}
              onChange={(reply) => {
                if (reply !== status) answering.answer(share, reply)
              }}
            />
          </View>
        </InputRowContainer>
      ) : null}
    </BuddiesSection>
  )
}
