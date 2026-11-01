import { useState } from 'react'
import type {
  ScribeConversationController,
  ScribeTimelineItem,
} from '@/features/scribe/types'
import { DEFAULT_SCRIBE_LIMITS } from '@/features/scribe/lib/wire'
import { ulid } from '@/features/scribe/lib/ulid'
import { scribeRuntime } from '@/features/scribe/runtime/deps'
import {
  conversationBudget,
  retryScribeTurn,
  sendScribeMessage,
} from '@/features/scribe/runtime/turnLoop'
import {
  abortTurn,
  IDLE_RUN,
  useScribeRuns,
} from '@/features/scribe/runtime/runs'
import { useScribeConversations } from '@/features/scribe/stores/conversations'
import { useScribeStatusStore } from '@/features/scribe/stores/status'
import { SCRIBE_TOOLS } from '@/features/scribe/tools'

const NO_ITEMS: readonly ScribeTimelineItem[] = []

export function useScribeConversation(
  conversationId: string | null
): ScribeConversationController {
  const [started, setStarted] = useState<{
    for: string | null
    id: string
  } | null>(null)
  const id =
    conversationId ??
    (started && started.for === conversationId ? started.id : null)

  const conversation = useScribeConversations((state) =>
    id ? (state.conversations[id] ?? null) : null
  )
  const run = useScribeRuns((state) =>
    id ? (state.runs[id] ?? IDLE_RUN) : IDLE_RUN
  )
  const streaming = useScribeRuns((state) =>
    id ? (state.streaming[id] ?? null) : null
  )
  const drafting = useScribeRuns((state) =>
    id ? (state.drafting[id] ?? null) : null
  )
  const limits = useScribeStatusStore(
    (state) => state.status?.limits ?? DEFAULT_SCRIBE_LIMITS
  )

  const stored = conversation?.items ?? NO_ITEMS

  const draftItem: ScribeTimelineItem | null =
    drafting &&
    !stored.some(
      (item) => item.type === 'proposal' && item.proposalId === drafting.id
    )
      ? {
          type: 'proposal',
          id: `${drafting.id}-item`,
          at: drafting.createdAt,
          proposalId: drafting.id,
        }
      : null
  const items: readonly ScribeTimelineItem[] =
    streaming?.text || draftItem
      ? [
          ...stored,
          ...(streaming?.text
            ? [
                {
                  type: 'assistant' as const,
                  id: streaming.itemId,
                  at: streaming.at,
                  text: streaming.text,
                  streaming: true,
                },
              ]
            : []),
          ...(draftItem ? [draftItem] : []),
        ]
      : stored

  return {
    conversationId: id,
    items,
    run,
    budget: conversation
      ? conversationBudget(conversation, {
          tools: SCRIBE_TOOLS,
          limits: () => limits,
        })
      : 'ok',
    pendingProposalId: conversation?.pendingProposalId ?? null,
    send: async (input) => {
      const target = id ?? ulid()
      if (!id) setStarted({ for: conversationId, id: target })
      await sendScribeMessage(scribeRuntime(), target, input)
    },
    retry: async () => {
      if (id) await retryScribeTurn(scribeRuntime(), id)
    },
    stop: () => {
      if (id) abortTurn(id)
    },
  }
}
