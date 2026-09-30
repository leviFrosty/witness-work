import { useEffect } from 'react'
import { AppState } from 'react-native'
import useContacts from '@/stores/contactsStore'
import { expireDeletedContactDetails } from '@/lib/contactRetention'

/** Retention applies locally on both platforms, independently of sync access. */
export function useDeletedContactRetention(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready) return
    const expire = () => {
      const state = useContacts.getState()
      const expired = expireDeletedContactDetails(state.deletedContacts)
      if (
        expired.some(
          (contact, index) => contact !== state.deletedContacts[index]
        )
      )
        state.set({ deletedContacts: expired })
    }
    const unsubscribe = useContacts.subscribe((state, previous) => {
      if (state.deletedContacts !== previous.deletedContacts) expire()
    })
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') expire()
    })
    expire()
    return () => {
      unsubscribe()
      foreground.remove()
    }
  }, [ready])
}
