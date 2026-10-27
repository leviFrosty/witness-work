import type {
  ScribeUndoResult,
  ScribeUndoSource,
} from '@/features/scribe/types'
import { undoScribeProposalNow } from '@/features/scribe/proposals/actions'
import { refreshStatus, refreshUsage } from '@/features/scribe/runtime/status'

export * from '@/features/scribe/types'

export { useScribeEnabled, useScribeOffered } from '@/hooks/useScribeEnabled'
export { useScribeAvailability } from '@/features/scribe/hooks/useScribeAvailability'
export { useScribeVoiceAvailability } from '@/features/scribe/hooks/useScribeVoiceAvailability'
export { useScribeUsage } from '@/features/scribe/hooks/useScribeUsage'
export { useScribeConversation } from '@/features/scribe/hooks/useScribeConversation'
export { useScribeProposal } from '@/features/scribe/hooks/useScribeProposal'
export { useScribeHistory } from '@/features/scribe/hooks/useScribeHistory'
export { useScribeVoiceCapture } from '@/features/scribe/hooks/useScribeVoiceCapture'
export { useScribePhotoCapture } from '@/features/scribe/hooks/useScribePhotoCapture'
export { useScribePaperCapture } from '@/features/scribe/hooks/useScribePaperCapture'
export { useScribeHasFinishedTurn } from '@/features/scribe/hooks/useScribeHasFinishedTurn'
export { ScribeRoot } from '@/features/scribe/runtime/ScribeRoot'
export { useScribeMemoryEnabled } from '@/features/scribe/stores/memory'
export { forgoResume as forgoScribeResume } from '@/features/scribe/runtime/runs'
export {
  SCRIBE_PAPER_MAX_PAGES,
  SCRIBE_UNDO_WINDOW_DAYS,
  SCRIBE_VOICE_DISCARD_CONFIRM_MS,
  SCRIBE_VOICE_MAX_MS,
  SCRIBE_VOICE_QUIET_MS,
} from '@/features/scribe/constants'

/** Undo an applied Proposal (toast, History, or its conversation). */
export async function undoScribeProposal(
  proposalId: string,
  source: ScribeUndoSource
): Promise<ScribeUndoResult> {
  return undoScribeProposalNow(proposalId, source)
}

/** Re-check status and usage now (pull to refresh, returning online). */
export function refreshScribeStatus(): void {
  void refreshStatus({ force: true })
  void refreshUsage({ force: true })
}
