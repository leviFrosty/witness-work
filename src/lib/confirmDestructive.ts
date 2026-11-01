import { Alert } from 'react-native'

import i18n from '@/lib/locales'

interface ConfirmDestructiveOptions {
  title: string

  description?: string

  confirmLabel?: string

  onConfirm: () => void

  alternative?: { label: string; onPress: () => void }
}

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
