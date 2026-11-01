import type {
  ScribeConversationRouteParams,
  ScribeVoiceRouteParams,
} from '@/types/rootStack'
import type {
  ScribeConversationParams,
  ScribeVoiceParams,
} from '@/features/scribe/types'

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
