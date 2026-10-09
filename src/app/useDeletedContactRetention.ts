import { useEffect } from 'react'
import useContacts from '@/stores/contactsStore'
import { expireDeletedContactDetails } from '@/lib/contactRetention'
import { addForegroundListener } from '@/lib/appLifecycle'

/** Retention applies locally on both platforms, independently of sync access. */
export function useDeletedContactRetention(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready) return
    // Its own write changes `deletedContacts` too; that needs no second pass.
    let expiring = false
    const expire = () => {
      if (expiring) return
      const state = useContacts.getState()
      const expired = expireDeletedContactDetails(state.deletedContacts)
      if (
        expired.some(
          (contact, index) => contact !== state.deletedContacts[index]
        )
      ) {
        expiring = true
        state.set({ deletedContacts: expired })
        expiring = false
      }
    }
    const unsubscribe = useContacts.subscribe((state, previous) => {
      if (state.deletedContacts !== previous.deletedContacts) expire()
    })
    const foreground = addForegroundListener(expire)
    expire()
    return () => {
      unsubscribe()
      foreground.remove()
    }
  }, [ready])
}
