import { analytics } from '@/lib/analytics'
import type { ShareReply, ShareType } from '@/features/buddies/lib/schemas'

export type ShareAnswerSource =
  | 'notifications'
  | 'buddy_detail'
  | 'plan_details'
  | 'follow_up_details'
  | 'home'

export function trackShareAnswer(
  source: ShareAnswerSource,
  type: ShareType | undefined,
  answer: ShareReply
) {
  analytics.capture('buddy_invitation_answered', { source, type, answer })
}
