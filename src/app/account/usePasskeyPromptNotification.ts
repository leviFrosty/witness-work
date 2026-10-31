import { useEffect, useState } from 'react'
import { UserRoundKey as UserRoundKeyIcon } from 'lucide-react-native'
import { addPasskeyWithToasts } from '@/features/settings/components/account/passkeys/passkeyActions'
import { type PasskeyOffer, readPasskeyOffer } from '@/app/account/passkeyOffer'
import {
  adoptPasskeyPromptAccount,
  dismissPasskeyPrompt,
  notNowPasskeyPrompt,
  passkeyAccountId,
  recordPasskeyPromptShown,
  recordPasskeyPromptTapped,
  stopPasskeyPrompt,
} from '@/app/account/passkeyPrompt'
import { addReconnectListener } from '@/lib/http/online'
import i18n from '@/lib/locales'
import { passkeyPromptDue } from '@/lib/passkeys/promptRules'
import { onAccountChange } from '@/lib/serverAccount'
import { usePreferences } from '@/stores/preferences'
import type { NotificationItem } from '@/types/notifications'

/** How long an answer about an account stands before the bell asks again. */
const OFFER_CHECK_TTL_MS = 10 * 60 * 1000

type OfferCheck = { account: string; at: number; offer: PasskeyOffer }

// The last answer, so a bell that mounts again doesn't ask the server again.
let lastCheck: OfferCheck | null = null
const recheckListeners = new Set<() => void>()

/** Forgets the last answer (tests). */
export const forgetPasskeyOfferCheck = () => {
  lastCheck = null
}

/**
 * The tray opened: a check that failed is tried again. A good answer stands
 * until it's old.
 */
export const recheckPasskeyOffer = () => {
  recheckListeners.forEach((listener) => listener())
}

const freshCheck = (): OfferCheck | null => {
  const account = passkeyAccountId()
  return lastCheck &&
    lastCheck.account === account &&
    Date.now() - lastCheck.at < OFFER_CHECK_TTL_MS
    ? lastCheck
    : null
}

/**
 * The gentle prompt to save a passkey (ADR 0038 §9), in the tray: for someone
 * whose account has none, after they turned on Cloud Sync or backup, set up
 * another device, or finished onboarding on a new install. Add a Passkey runs
 * the Settings flow in place; Not Now backs it off for 30 days and counts
 * toward stopping, while dismissing the row only backs it off (`passkeyPrompt`
 * has the rules). It's listed only once the account is known to have no
 * passkey. A check that couldn't tell (offline, no account yet) is made again
 * when the connection returns, the account opens, or the tray opens.
 */
export function usePasskeyPromptNotification(
  now: number
): NotificationItem | null {
  const state = usePreferences((s) => s.passkeyPrompt)
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)
  const [adding, setAdding] = useState(false)
  // What the last check of the account answered, and for which account.
  const [checked, setChecked] = useState<{
    account: string | null
    offer: PasskeyOffer
  } | null>(null)

  const earnedAt = state.earned?.at ?? null
  const due = passkeyPromptDue({ state, now, onboardingComplete })

  useEffect(() => {
    adoptPasskeyPromptAccount(passkeyAccountId())
    return onAccountChange(() => adoptPasskeyPromptAccount(passkeyAccountId()))
  }, [])

  useEffect(() => {
    if (!due) return
    let live = true
    const apply = (account: string | null, offer: PasskeyOffer) => {
      if (offer === 'has_passkey') stopPasskeyPrompt()
      setChecked({ account, offer })
    }
    // `reuse` says which fresh answers stand: all of them when the bell mounts,
    // only a good one when the tray opens.
    const check = (reuse: (cached: OfferCheck) => boolean) => {
      const cached = freshCheck()
      if (cached && reuse(cached)) return apply(cached.account, cached.offer)
      void readPasskeyOffer().then((offer) => {
        if (!live) return
        const account = passkeyAccountId()
        if (account !== null) lastCheck = { account, at: Date.now(), offer }
        apply(account, offer)
      })
    }
    const force = () => check(() => false)
    check(() => true)
    const recheck = () => check((cached) => cached.offer === 'offer')
    recheckListeners.add(recheck)
    const unsubscribeAccount = onAccountChange(force)
    const reconnect = addReconnectListener(force)
    return () => {
      live = false
      recheckListeners.delete(recheck)
      unsubscribeAccount()
      reconnect.remove()
    }
  }, [due])

  const listed =
    due &&
    earnedAt !== null &&
    checked?.offer === 'offer' &&
    checked.account === passkeyAccountId()
  if (!listed || earnedAt === null) return null

  const add = () => {
    if (adding) return
    setAdding(true)
    recordPasskeyPromptTapped()
    // Adding a passkey stops the prompt itself (`addPasskeyWithToasts`).
    void addPasskeyWithToasts({
      count: 0,
      support: null,
      source: 'prompt',
    }).finally(() => setAdding(false))
  }

  return {
    id: `passkey_prompt:${earnedAt}`,
    kind: 'passkey',
    at: earnedAt,
    icon: UserRoundKeyIcon,
    tone: 'accent',
    title: i18n.t('passkeyPrompt_title'),
    description: i18n.t('passkeyPrompt_description'),
    actions: [
      // Stays in the tray: a failed or cancelled try leaves the row to retry.
      {
        id: 'add',
        label: i18n.t(adding ? 'passkeyPrompt_adding' : 'passkeys_add'),
        inPlace: true,
        onPress: add,
      },
      {
        id: 'not_now',
        label: i18n.t('notNow'),
        inPlace: true,
        onPress: () => notNowPasskeyPrompt(),
      },
    ],
    onView: recordPasskeyPromptShown,
    onDismiss: () => dismissPasskeyPrompt(),
  }
}
