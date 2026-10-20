import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Text from '@/components/ui/MyText'
import SegmentedControl from '@/components/ui/SegmentedControl'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { BuddyShareRef } from '@/types/timeEntry'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import useReplyDelivery from '@/features/buddies/hooks/useReplyDelivery'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import type { ShareReply } from '@/features/buddies/lib/schemas'
import {
  incomingShareKey,
  type IncomingShare,
  type IncomingShareStatus,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import ShareBuddyRow from '@/features/buddies/components/ShareBuddyRow'

/** Answering a buddy's invitation from its page (Plan Details, a Follow-up's). */
export type ShareAnswering = {
  busy: boolean
  answer: (share: BuddyShareRef, reply: ShareReply) => void
}

/**
 * A buddy's Plan or Follow-up invitation: who organized it, and (while it can
 * still be answered) the User's answer as two side-by-side choices, so
 * switching back is one tap either way. An answer that didn't send offers Try
 * Again.
 */
export default function InvitationAnswerSection({
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
  const theme = useTheme()
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === from)
  )
  // e.g. "Sending in 12s" while a Can't Make It can still change.
  const delivery = useReplyDelivery(
    share ? incomingShareKey(share.from, share.shareId) : undefined
  )
  if (!buddy) return null
  const name = buddyDisplayName(buddy)

  return (
    <BuddiesSection title={i18n.t('buddies_title')}>
      <ShareBuddyRow
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
          description={delivery.label}
          labelTrailing={
            delivery.retry ? (
              <Button
                onPress={delivery.retry}
                accessibilityRole='button'
                style={{ marginLeft: 'auto' }}
              >
                <Text
                  style={{
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('sm'),
                  }}
                >
                  {i18n.t('buddies_tryAgain')}
                </Text>
              </Button>
            ) : undefined
          }
          controlWidth='full'
          lastInSection
        >
          <SegmentedControl<ShareReply>
            options={[
              { key: 'going', label: i18n.t('buddies_going') },
              { key: 'declined', label: i18n.t('buddies_cantMakeIt') },
            ]}
            value={status === 'pending' ? null : status}
            onChange={(reply) => {
              if (reply !== status) answering.answer(share, reply)
            }}
            disabled={answering.busy}
          />
        </InputRowContainer>
      ) : null}
    </BuddiesSection>
  )
}
