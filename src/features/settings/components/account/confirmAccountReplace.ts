import { Alert, Platform } from 'react-native'
import {
  type AccountKeyLoss,
  losesSomething,
} from '@/lib/accountKey/accountKey'
import i18n from '@/lib/locales'

/** Buddies named one per line; past this many, the rest are counted. */
export const NAMED_BUDDIES = 5

/**
 * The warning's Buddies part: naming them when there are any, and saying
 * whether they stay on the account's other devices.
 */
export function buddiesLossMessage(loss: AccountKeyLoss): string | null {
  if (loss.buddies <= 0)
    return losesSomething(loss)
      ? i18n.t(
          loss.keptElsewhere
            ? 'account_replaceInboxElsewhere'
            : 'account_replaceInbox'
        )
      : null
  const named = loss.buddyNames.slice(0, NAMED_BUDDIES)
  const rest = loss.buddies - named.length
  const names = [
    ...named.map((name) => `• ${name}`),
    ...(rest > 0
      ? // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
        [i18n.t('account_replaceBuddiesMore', { count: rest })]
      : []),
  ].join('\n')
  const key = loss.keptElsewhere
    ? 'account_replaceBuddiesElsewhere'
    : 'account_replaceBuddies'
  // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
  return i18n.t(key, {
    count: loss.buddies,
    name: named[0] ?? '',
    names,
  })
}

/**
 * Asks before this phone's account key is replaced, naming the buddies and
 * Buddies data it loses (and whether the account's other devices keep them)
 * and, on iOS, the other Apple devices it reaches. Resolves whether to go
 * ahead.
 */
export function confirmAccountReplace(
  loss: AccountKeyLoss,
  via: 'recoveryKey' | 'handoff'
): Promise<boolean> {
  const message = [
    buddiesLossMessage(loss),
    Platform.OS === 'ios' ? i18n.t('account_replaceAppleDevices') : null,
  ]
    .filter(Boolean)
    .join('\n\n')
  return new Promise((resolve) =>
    Alert.alert(
      i18n.t(
        via === 'handoff' ? 'handoff_replaceTitle' : 'account_replaceTitle'
      ),
      message,
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: i18n.t(
            via === 'handoff'
              ? 'handoff_replaceConfirm'
              : 'account_replaceConfirm'
          ),
          style: losesSomething(loss) ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    )
  )
}
