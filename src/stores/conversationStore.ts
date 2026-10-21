import { syncTimestamp } from '@/lib/syncClock'
import { stampPastTombstone, withoutTombstones } from '@/lib/syncTombstones'
import { create } from 'zustand'
import { combine, createJSONStorage } from 'zustand/middleware'
import { persist } from '@/stores/persist'
import { Visit, VisitTombstone } from '@/types/visit'
import {
  CustomFieldDefinition,
  CustomFieldTombstone,
} from '@/types/customField'
import {
  stripTombstonedCustomFieldValues,
  stripTombstonedCustomFields,
} from '@/lib/customFields'
import {
  addCustomFieldDefinition,
  archiveCustomFieldDefinition,
  purgeCustomFieldDefinition,
  renameCustomFieldDefinition,
  reorderCustomFieldDefinitions,
  restoreCustomFieldDefinition,
} from '@/lib/customFieldDefinitions'
import { PersistStorage } from '@/stores/mmkv'
import { stripPlaceholderFollowUp } from '@/lib/conversations'

/**
 * V0 → v1: the visit form gained a Follow Up switch, so a Visit only carries
 * `followUp` when the user actually wants one. Before that, every Visit was
 * saved with an auto-filled placeholder follow-up and intent was inferred from
 * notify/topic. Strip those placeholders so `isAppointment` can trust the
 * presence of `followUp` without flooding "Missed Conversations". `updatedAt`
 * is left alone on purpose: a peer that hasn't upgraded yet holds the same
 * timestamp, so neither side overwrites the other, and `parsePayload` strips
 * whatever placeholders still arrive from it.
 */
export const migrateConversationsPersistedState = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  persistedState: any,
  version: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => {
  if (version >= 1) return persistedState
  const conversations = (persistedState?.conversations ?? []) as Visit[]
  return {
    ...persistedState,
    conversations: conversations.map(stripPlaceholderFollowUp),
  }
}

const initialState = {
  // Persisted key kept as `conversations` for backward compatibility with
  // existing on-disk data and the iCloud sync wire payload. The type is the
  // canonical `Visit` (renamed from `Conversation`); see `@/types/visit`.
  conversations: [] as Visit[],
  /**
   * Tombstones for deleted Visits. Populated by `deleteConversation` so iCloud
   * sync can propagate deletions across devices. Never pruned: the merge keeps
   * every one (`mergeTombstones` in `src/app/sync/merge.ts`). Adding a Visit
   * under the id drops its tombstone here.
   *
   * Persisted key kept as `deletedConversations` for backward compatibility.
   */
  deletedConversations: [] as VisitTombstone[],
  /**
   * Definitions for the user-customizable conversation fields (e.g.
   * "Publication"). Same shape and lifecycle as the contact fields in
   * `contactsStore.customFieldDefs`, but a separate list: Visit `customFields`
   * records reference these ids.
   */
  conversationFieldDefs: [] as CustomFieldDefinition[],
  deletedConversationFieldDefs: [] as CustomFieldTombstone[],
}

/**
 * The store changes that add each of `incoming` whose id isn't taken yet, in
 * order. Pure: never mutates `state`. A deleted id can come back (an import run
 * again after its Undo), so each Visit is stamped past its tombstone and the
 * tombstone is dropped.
 */
const withAddedConversations = (
  {
    conversations,
    deletedConversations,
    deletedConversationFieldDefs,
  }: Pick<
    typeof initialState,
    'conversations' | 'deletedConversations' | 'deletedConversationFieldDefs'
  >,
  incoming: Visit[]
): Partial<typeof initialState> => {
  const takenIds = new Set(conversations.map((c) => c.id))
  const added: Visit[] = []
  for (const conversation of incoming) {
    if (takenIds.has(conversation.id)) continue
    added.push(
      stripTombstonedCustomFields(
        {
          ...conversation,
          updatedAt: stampPastTombstone(deletedConversations, conversation.id),
        },
        deletedConversationFieldDefs
      )
    )
    takenIds.add(conversation.id)
  }
  if (!added.length) return {}
  return {
    conversations: [...conversations, ...added],
    deletedConversations: withoutTombstones(
      deletedConversations,
      new Set(added.map((conversation) => conversation.id))
    ),
  }
}

export const useConversations = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addConversation: (conversation: Visit) =>
        set((state) => withAddedConversations(state, [conversation])),
      /**
       * `addConversation` for many Visits in one write, so an import persists
       * and notifies subscribers once instead of once per Visit.
       */
      addConversations: (conversations: Visit[]) =>
        set((state) => withAddedConversations(state, conversations)),
      deleteConversation: (id: string) =>
        set(({ conversations, deletedConversations }) => {
          const foundConversation = conversations.find(
            (conversation) => conversation.id === id
          )
          if (!foundConversation) {
            return {}
          }

          const now = syncTimestamp(
            conversations.find((conversation) => conversation.id === id)
              ?.updatedAt
          )
          return {
            conversations: conversations.filter(
              (conversation) => conversation.id !== id
            ),
            deletedConversations: [
              ...deletedConversations.filter((t) => t.id !== id),
              { id, deletedAt: now },
            ],
          }
        }),
      updateConversation: (conversation: Partial<Visit>) => {
        set(({ conversations, deletedConversationFieldDefs }) => {
          const updatedCustomFields = stripTombstonedCustomFieldValues(
            conversation.customFields,
            deletedConversationFieldDefs
          )
          return {
            conversations: conversations.map((c) => {
              if (c.id !== conversation.id) {
                return c
              }
              return {
                ...c,
                ...conversation,
                ...(conversation.customFields
                  ? { customFields: updatedCustomFields }
                  : {}),
                updatedAt: syncTimestamp(c.updatedAt),
              }
            }),
          }
        })
      },
      /** See `addCustomFieldDefinition`. */
      addConversationFieldDef: (
        label: string
      ): CustomFieldDefinition | null => {
        let result: CustomFieldDefinition | null = null
        set(({ conversationFieldDefs }) => {
          const { defs, def } = addCustomFieldDefinition(
            conversationFieldDefs,
            label
          )
          result = def
          return { conversationFieldDefs: defs }
        })
        return result
      },
      renameConversationFieldDef: (id: string, label: string) => {
        set(({ conversationFieldDefs }) => ({
          conversationFieldDefs: renameCustomFieldDefinition(
            conversationFieldDefs,
            id,
            label
          ),
        }))
      },
      reorderConversationFieldDefs: (orderedIds: string[]) => {
        set(({ conversationFieldDefs }) => ({
          conversationFieldDefs: reorderCustomFieldDefinitions(
            conversationFieldDefs,
            orderedIds
          ),
        }))
      },
      archiveConversationFieldDef: (id: string) => {
        set(({ conversationFieldDefs }) => ({
          conversationFieldDefs: archiveCustomFieldDefinition(
            conversationFieldDefs,
            id
          ),
        }))
      },
      restoreConversationFieldDef: (id: string) => {
        set(({ conversationFieldDefs }) => ({
          conversationFieldDefs: restoreCustomFieldDefinition(
            conversationFieldDefs,
            id
          ),
        }))
      },
      /**
       * Permanently removes an archived conversation field AND every visit's
       * value for it. Destructive; expose only from a confirmation flow.
       */
      purgeConversationFieldDef: (id: string) => {
        set(
          ({
            conversations,
            conversationFieldDefs,
            deletedConversationFieldDefs,
          }) => {
            const purged = purgeCustomFieldDefinition(
              conversationFieldDefs,
              deletedConversationFieldDefs,
              id
            )
            if (!purged)
              return { conversationFieldDefs, deletedConversationFieldDefs }
            const { tombstone } = purged
            return {
              conversationFieldDefs: purged.defs,
              deletedConversationFieldDefs: purged.tombstones,
              conversations: conversations.map((c) =>
                stripTombstonedCustomFields(c, [tombstone], tombstone.deletedAt)
              ),
            }
          }
        )
      },
      _WARNING_forceDeleteConversations: () =>
        set({ conversations: [], deletedConversations: [] }),
    })),
    {
      name: 'conversations',
      storage: createJSONStorage(() => PersistStorage),
      version: 1,
      migrate: (persistedState, version) =>
        migrateConversationsPersistedState(persistedState, version),
    }
  )
)

export default useConversations
