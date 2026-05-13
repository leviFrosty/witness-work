import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Conversation, ConversationTombstone } from '@/types/conversation'
import * as Notifications from 'expo-notifications'
import { hasMigratedFromAsyncStorage, MmkvStorage } from '@/stores/mmkv'

const initialState = {
  conversations: [] as Conversation[],
  /**
   * Tombstones for deleted conversations. Populated by `deleteConversation` so
   * iCloud sync can propagate deletions across devices. Pruned when a tombstone
   * exceeds the retention window (see `src/lib/sync/merge.ts`).
   */
  deletedConversations: [] as ConversationTombstone[],
}

export const useConversations = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addConversation: (conversation: Conversation) =>
        set(({ conversations }) => {
          const foundCurrentConversation = conversations.find(
            (c) => c.id === conversation.id
          )

          if (foundCurrentConversation) {
            return {}
          }

          return {
            conversations: [
              ...conversations,
              { ...conversation, updatedAt: Date.now() },
            ],
          }
        }),
      deleteConversation: (id: string) =>
        set(({ conversations, deletedConversations }) => {
          const foundConversation = conversations.find(
            (conversation) => conversation.id === id
          )
          if (!foundConversation) {
            return {}
          }

          foundConversation.followUp?.notifications?.forEach(
            async ({ id }) =>
              await Notifications.cancelScheduledNotificationAsync(id)
          )

          const now = Date.now()
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
      updateConversation: (conversation: Partial<Conversation>) => {
        set(({ conversations }) => {
          return {
            conversations: conversations.map((c) => {
              if (c.id !== conversation.id) {
                return c
              }
              return { ...c, ...conversation, updatedAt: Date.now() }
            }),
          }
        })
      },
      _WARNING_forceDeleteConversations: () =>
        set({ conversations: [], deletedConversations: [] }),
    })),
    {
      name: 'conversations',
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage() ? MmkvStorage : AsyncStorage
      ),
    }
  )
)

export default useConversations
