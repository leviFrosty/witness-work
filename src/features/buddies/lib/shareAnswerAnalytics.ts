import { analytics } from '@/lib/analytics'
import type { ShareReply, ShareType } from '@/features/buddies/lib/schemas'

/** Where an invitation was answered, for `buddy_invitation_answered`. */
export type ShareAnswerSource = 'notifications' | 'buddy_detail'

export function trackShareAnswer(
  source: ShareAnswerSource,
  type: ShareType | undefined,
  answer: ShareReply
) {
  analytics.capture('buddy_invitation_answered', { source, type, answer })
}
