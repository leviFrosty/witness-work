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

const OFFER_CHECK_TTL_MS = 10 * 60 * 1000

type OfferCheck = { account: string; at: number; offer: PasskeyOffer }

let lastCheck: OfferCheck | null = null
const recheckListeners = new Set<() => void>()

export const forgetPasskeyOfferCheck = () => {
  lastCheck = null
}

export const recheckPasskeyOffer = () => {
  recheckListeners.forEach((listener) => listener())
}

const freshCheck = (): OfferCheck | null => {
  if (!lastCheck || lastCheck.account !== passkeyAccountId()) return null
  const age = Date.now() - lastCheck.at
  return age >= 0 && age < OFFER_CHECK_TTL_MS ? lastCheck : null
}

export function usePasskeyPromptNotification(
  now: number
): NotificationItem | null {
  const state = usePreferences((s) => s.passkeyPrompt)
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)
  const [adding, setAdding] = useState(false)

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
