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

// A store a device backup brought from another phone holds that phone's
// marker and rows: dropped once, when the launch finds the move.
onInstallMoved(resetSignInNotices)

/**
 * The current session's account, without opening one, once the install check
 * has run (and dropped a copied store).
 */
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
  // Offline, no account key, the server busy: a later trigger tries again.
  onError: (error) => logger.debug('[signInNotices] read failed', error),
})

/**
 * Reads the newest activity for new sign-ins elsewhere. Coming to the
 * foreground reads at most every 15 minutes; Settings → Account passes `force`.
 * Never throws, and reads only for a device that already has a session.
 */
export const checkSignInNotices = (options?: { force?: boolean }) =>
  checker.check(options)

/**
 * Reads now and on every trigger: coming back to the app, a browser tab getting
 * focus, and this device's session opening. A session opened where there was
 * none (`new`: signing in again, or a fresh install) starts over, so its first
 * read only sets where the notices start. Returns a stop function.
 */
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
