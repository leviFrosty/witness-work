import type { ReactNode } from 'react'
import { View } from 'react-native'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import useTheme from '@/contexts/theme'
import type {
  ScribeAvailability,
  ScribeConversationController,
  ScribeUsage,
} from '@/features/scribe/types'
import ScribeReviewFooter from '@/features/scribe/components/ScribeReviewFooter'
import {
  ScribeBlockedCard,
  ScribeFullCard,
  ScribeLimitCard,
  ScribeNearFullBanner,
  ScribeOfflineBanner,
  ScribeUnavailableCard,
  type RenderSupporterCta,
} from '@/features/scribe/components/ScribeStateCards'
import { CONVERSATION_MAX_WIDTH } from '@/features/scribe/components/ScribeTimeline'

interface Props {
  controller: ScribeConversationController
  availability: ScribeAvailability
  usage: ScribeUsage | null
  /** The composer, shown when nothing below takes its place. */
  composer: ReactNode
  onNewConversation: () => void
  onUpgrade: () => void
  renderSupporterCta?: RenderSupporterCta
}

/**
 * Under the conversation: Add while cards wait for review, then the composer,
 * or what takes its place (blocked, limit reached, conversation full).
 */
const ScribeConversationFooter = ({
  controller,
  availability,
  usage,
  composer,
  onNewConversation,
  onUpgrade,
  renderSupporterCta,
}: Props) => {
  const theme = useTheme()
  const { isWide } = useAdaptiveLayout()
  const { run, budget, pendingProposalId } = controller
  const errorCode = run.phase === 'error' ? run.error.code : null
  const limited =
    (availability.status === 'available' && availability.limited) ||
    errorCode === 'limit_reached'
  const resetsAt =
    (availability.status === 'available' ? availability.resetsAt : null) ??
    (run.phase === 'error' ? run.error.resetsAt : null) ??
    usage?.resetsAt ??
    null

  const bottom = (() => {
    if (availability.status === 'hidden') return <ScribeUnavailableCard />
    if (availability.status === 'blocked')
      return <ScribeBlockedCard reason={availability.reason} />
    if (limited)
      return (
        <ScribeLimitCard
          plan={usage?.plan ?? 'free'}
          supporterCheckFailed={usage?.supporterCheckFailed ?? false}
          resetsAt={resetsAt}
          onUpgrade={onUpgrade}
          renderSupporterCta={renderSupporterCta}
        />
      )
    if (budget === 'full' || errorCode === 'context_full')
      return <ScribeFullCard onNewConversation={onNewConversation} />
    return (
      <>
        {availability.status === 'offline' ? <ScribeOfflineBanner /> : null}
        {budget === 'nearFull' ? (
          <ScribeNearFullBanner onNewConversation={onNewConversation} />
        ) : null}
        {composer}
      </>
    )
  })()

  return (
    <View
      style={{
        // The composer's field shrinks before anything here is cut off.
        flexShrink: 1,
        width: '100%',
        maxWidth: CONVERSATION_MAX_WIDTH,
        alignSelf: 'center',
        paddingHorizontal: isWide ? 24 : 12,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 10,
        borderTopWidth: pendingProposalId ? 1 : 0,
        borderTopColor: theme.colors.border,
      }}
    >
      {pendingProposalId ? (
        <ScribeReviewFooter proposalId={pendingProposalId} />
      ) : null}
      {bottom}
    </View>
  )
}

export default ScribeConversationFooter
