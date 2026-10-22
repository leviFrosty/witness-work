import type {
  ScribeConversationRouteParams,
  ScribeVoiceRouteParams,
} from '@/types/rootStack'
import type {
  ScribeConversationParams,
  ScribeVoiceParams,
} from '@/features/scribe/types'

// The root stack spells out Scribe AI's route params (shared types can't import
// a feature). These fail to compile when they stop matching the seam's.
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false

export const scribeConversationParamsMatch: Same<
  ScribeConversationRouteParams,
  ScribeConversationParams
> = true

export const scribeVoiceParamsMatch: Same<
  ScribeVoiceRouteParams,
  ScribeVoiceParams
> = true
