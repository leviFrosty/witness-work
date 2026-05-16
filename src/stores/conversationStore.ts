import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Visit, VisitTombstone } from '@/types/visit'
import * as Notifications from 'expo-notifications'
import { hasMigratedFromAsyncStorage, MmkvStorage } from '@/stores/mmkv'

const initialState = {
  // Persisted key kept as `conversations` for backward compatibility with
  // existing on-disk data and the iCloud sync wire payload. The type is the
  // canonical `Visit` (renamed from `Conversation`); see `@/types/visit`.
  conversations: [] as Visit[],
  /**
   * Tombstones for deleted Visits. Populated by `deleteConversation` so iCloud
   * sync can propagate deletions across devices. Pruned when a tombstone
   * exceeds the retention window (see `src/lib/sync/merge.ts`).
   *
   * Persisted key kept as `deletedConversations` for backward compatibility.
   */
  deletedConversations: [] as VisitTombstone[],
}

export const useConversations = create(
  persist(
    combine(initialState, (set) => ({
      set,
      addConversation: (conversation: Visit) =>
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
      updateConversation: (conversation: Partial<Visit>) => {
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
