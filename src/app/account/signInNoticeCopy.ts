import { Platform } from 'react-native'
import {
  History as HistoryIcon,
  MonitorSmartphone as MonitorSmartphoneIcon,
  UserRoundKey as UserRoundKeyIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type {
  SignInNotice,
  SignInNoticeKind,
} from '@/app/account/signInNotices'
import { activityTitle } from '@/features/settings/components/account/activity/activityCopy'
import i18n, { type TranslationKey } from '@/lib/locales'

const isWeb = Platform.OS === 'web'

/** A string in the phone app, and its web variant. */
type Copy = { phone: TranslationKey; web: TranslationKey }

/**
 * Each sign-in notice row's look, words, and where it leads. The sentence for
 * an entry is Account Activity's own ("Signed in on Chrome on macOS with a
 * passkey"), from the names the read opened. The web can't change the account
 * key, so its rows say to do that on a phone.
 */
type RowSpec = {
  icon: AppIcon
  /**
   * `{{count}}`; a plural key (`one`/`other`), except `overflow`'s, which
   * always counts hundreds.
   */
  title: { key: string; plural: boolean }
  /** `{{activity}}`: the newest entry's sentence. */
  description: Copy
  /** The same, for a row standing for several. */
  latest: Copy
  /** The action's analytics id, label, and screen. */
  action: {
    id: string
    label: TranslationKey
    screen: 'Account Devices' | 'Account Passkeys' | 'Account Activity'
  }
}

const devices = {
  id: 'devices',
  label: 'accountSecurity_devices',
  screen: 'Account Devices',
} as const

const signOut = {
  description: {
    phone: 'signInNotice_sessionDescription',
    web: 'signInNotice_sessionDescriptionWeb',
  },
  latest: {
    phone: 'signInNotice_sessionLatest',
    web: 'signInNotice_sessionLatestWeb',
  },
} as const

const overflowDescription = {
  phone: 'signInNotice_overflowDescription',
  web: 'signInNotice_overflowDescription',
} as const

export const SIGN_IN_NOTICE_ROWS: Record<SignInNoticeKind, RowSpec> = {
  session: {
    icon: MonitorSmartphoneIcon,
    title: { key: 'signInNotice_sessionTitle', plural: true },
    ...signOut,
    action: devices,
  },
  approval: {
    icon: MonitorSmartphoneIcon,
    title: { key: 'signInNotice_approvalTitle', plural: true },
    ...signOut,
    action: devices,
  },
  passkey: {
    icon: UserRoundKeyIcon,
    title: { key: 'signInNotice_passkeyTitle', plural: true },
    description: {
      phone: 'signInNotice_passkeyDescription',
      web: 'signInNotice_passkeyDescriptionWeb',
    },
    latest: {
      phone: 'signInNotice_passkeyLatest',
      web: 'signInNotice_passkeyLatestWeb',
    },
    action: {
      id: 'passkeys',
      label: 'accountSecurity_passkeys',
      screen: 'Account Passkeys',
    },
  },
  overflow: {
    icon: HistoryIcon,
    title: { key: 'signInNotice_overflowTitle', plural: false },
    description: overflowDescription,
    latest: overflowDescription,
    action: {
      id: 'activity',
      label: 'accountSecurity_activity',
      screen: 'Account Activity',
    },
  },
}

/** The newest entry, as Account Activity would say it. */
const activitySentence = (notice: SignInNotice): string | null =>
  notice.entryKind
    ? activityTitle({
        kind: notice.entryKind,
        method: notice.method,
        slotId: null,
        session: notice.device,
        actor: notice.actor,
      })
    : null

export const signInNoticeTitle = (notice: SignInNotice): string =>
  // Plural keys are objects, which `TranslationKey` doesn't list.
  i18n.t(SIGN_IN_NOTICE_ROWS[notice.kind].title.key as TranslationKey, {
    count: notice.count,
  })

export function signInNoticeDescription(notice: SignInNotice): string {
  const row = SIGN_IN_NOTICE_ROWS[notice.kind]
  const copy = notice.count > 1 ? row.latest : row.description
  return i18n.t(isWeb ? copy.web : copy.phone, {
    activity: activitySentence(notice) ?? '',
  })
}
