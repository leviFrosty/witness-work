import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { persist, combine, createJSONStorage } from 'zustand/middleware'
import { Conversation } from '../types/conversation'
import * as Notifications from 'expo-notifications'
import { hasMigratedFromAsyncStorage, MmkvStorage } from './mmkv'

const initialState = {
  conversations: [] as Conversation[],
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
            conversations: [...conversations, conversation],
          }
        }),
      deleteConversation: (id: string) =>
        set(({ conversations }) => {
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

          return {
            conversations: conversations.filter(
              (conversation) => conversation.id !== id
            ),
          }
        }),
      updateConversation: (conversation: Partial<Conversation>) => {
        set(({ conversations }) => {
          return {
            conversations: conversations.map((c) => {
              if (c.id !== conversation.id) {
                return c
              }
              return { ...c, ...conversation }
            }),
          }
        })
      },
      _WARNING_forceDeleteConversations: () => set({ conversations: [] }),
    })),
    {
      name: 'conversations',
      storage: createJSONStorage(() =>
        hasMigratedFromAsyncStorage ? MmkvStorage : AsyncStorage
      ),
    }
  )
)

export default useConversations
