import { Alert } from 'react-native'

import i18n from '@/lib/locales'

interface ConfirmDestructiveOptions {
  /** Alert title — phrase it as the question being confirmed. */
  title: string
  /** Optional supporting copy, e.g. what exactly gets removed. */
  description?: string
  /** Label for the destructive button. Defaults to the localized "Delete". */
  confirmLabel?: string
  /** Runs only when the user taps the destructive button. */
  onConfirm: () => void
  /**
   * A gentler choice offered between Cancel and the destructive button, e.g.
   * "Archive Instead" for a permanent delete.
   */
  alternative?: { label: string; onPress: () => void }
}

/**
 * Standard two-button destructive confirmation: a cancel and a red confirm.
 *
 * Reach for this instead of hand-rolling `Alert.alert` so every delete flow in
 * the app reads the same — cancel first, destructive second, localized labels.
 */
const confirmDestructive = ({
  title,
  description,
  confirmLabel,
  onConfirm,
  alternative,
}: ConfirmDestructiveOptions) => {
  Alert.alert(title, description, [
    { text: i18n.t('cancel'), style: 'cancel' },
    ...(alternative
      ? [{ text: alternative.label, onPress: alternative.onPress }]
      : []),
    {
      text: confirmLabel ?? i18n.t('delete'),
      style: 'destructive',
      onPress: onConfirm,
    },
  ])
}

export default confirmDestructive
