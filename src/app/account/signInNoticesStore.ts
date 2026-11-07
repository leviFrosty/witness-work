import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import {
  SIGN_IN_NOTICES_INITIAL,
  type SignInNoticesState,
} from '@/app/account/signInNotices'
import { MmkvStorage } from '@/stores/mmkv'
import { keepPersistedState, persist } from '@/stores/persist'

export const useSignInNotices = create<SignInNoticesState>()(
  persist((): SignInNoticesState => SIGN_IN_NOTICES_INITIAL, {
    name: 'signInNotices',
    version: 1,
    migrate: keepPersistedState,
    storage: createJSONStorage(() => MmkvStorage),
  })
)

export function removeSignInNotice(id: string) {
  const state = useSignInNotices.getState()
  const notices = state.notices.filter((notice) => notice.id !== id)
  if (notices.length !== state.notices.length)
    useSignInNotices.setState({ notices })
}

export function markSignInNoticeShown(id: string): boolean {
  const state = useSignInNotices.getState()
  const notice = state.notices.find((n) => n.id === id)
  if (!notice || notice.shown) return false
  useSignInNotices.setState({
    notices: state.notices.map((n) =>
      n.id === id ? { ...n, shown: true } : n
    ),
  })
  return true
}
