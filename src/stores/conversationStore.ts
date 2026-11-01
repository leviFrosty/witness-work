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

export const migrateConversationsPersistedState = (
  persistedState: any,
  version: number
): any => {
  if (version >= 1) return persistedState
  const conversations = (persistedState?.conversations ?? []) as Visit[]
  return {
    ...persistedState,
    conversations: conversations.map(stripPlaceholderFollowUp),
  }
}

const initialState = {
  conversations: [] as Visit[],

  deletedConversations: [] as VisitTombstone[],

  conversationFieldDefs: [] as CustomFieldDefinition[],
  deletedConversationFieldDefs: [] as CustomFieldTombstone[],
}

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
