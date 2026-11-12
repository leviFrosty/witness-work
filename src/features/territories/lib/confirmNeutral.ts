import { showAlert } from '@/lib/alert'
import i18n from '@/lib/locales'

export default function confirmNeutral({
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  title: string
  description?: string
  confirmLabel: string
  onConfirm: () => void
}) {
  showAlert(title, description, [
    { text: i18n.t('cancel'), style: 'cancel' },
    { text: confirmLabel, isPreferred: true, onPress: onConfirm },
  ])
}
