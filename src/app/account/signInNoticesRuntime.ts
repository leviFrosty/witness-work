import { loadAccountActivity } from '@/app/account/accountActivity'
import {
  createSignInNoticeChecker,
  SIGN_IN_NOTICES_INITIAL,
} from '@/app/account/signInNotices'
import { useSignInNotices } from '@/app/account/signInNoticesStore'
import {
  addForegroundListener,
  addWindowFocusListener,
} from '@/lib/appLifecycle'
import { logger } from '@/lib/logger'
import {
  accountSessions,
  checkInstall,
  onAccountChange,
  onInstallMoved,
} from '@/lib/serverAccount'

const resetSignInNotices = () =>
  useSignInNotices.setState(SIGN_IN_NOTICES_INITIAL, true)

onInstallMoved(resetSignInNotices)

async function sessionAccount(): Promise<string | null> {
  await checkInstall()
  await accountSessions.ready()
  return accountSessions.snapshot()?.accountId ?? null
}

const checker = createSignInNoticeChecker({
  account: sessionAccount,
  loadPage: async (before) => {
    const { entries, nextCursor, context } = await loadAccountActivity(before)
    return {
      entries,
      nextCursor,
      isThisDevice: context.isThisDevice,
      readName: (sealed) => context.readLabel(sealed)?.name ?? null,
    }
  },
  getState: () => useSignInNotices.getState(),
  setState: (state) => useSignInNotices.setState(state, true),
  now: () => Date.now(),

  onError: (error) => logger.debug('[signInNotices] read failed', error),
})

export const checkSignInNotices = (options?: { force?: boolean }) =>
  checker.check(options)

export function watchSignInNotices(): () => void {
  void checkSignInNotices()
  const foreground = addForegroundListener(() => void checkSignInNotices())
  const focus = addWindowFocusListener(() => void checkSignInNotices())
  const stopAccount = onAccountChange((change, detail) => {
    if (change === 'session_opened' && detail.reason === 'new')
      resetSignInNotices()
    void checkSignInNotices()
  })
  return () => {
    foreground.remove()
    focus.remove()
    stopAccount()
  }
}
