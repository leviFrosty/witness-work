import * as Clipboard from 'expo-clipboard'
import { toast } from '@/stores/toasts'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { shareUrl } from '@/lib/share'

export default function useLinkMenuActions({
  url,
  label,
  onOpen,
}: {
  url?: string

  label?: string
  onOpen?: () => void
}): ContextMenuEntries {
  if (!url) return []

  const copyLink = async () => {
    try {
      await Clipboard.setStringAsync(url)
      Haptics.success()
      toast.success(i18n.t('linkCopied'), { durationMs: 2000 })
    } catch {
      Haptics.error()
    }
  }

  return [
    [
      onOpen && {
        id: 'open',
        title: i18n.t('open'),
        systemImage: 'safari',
        onPress: onOpen,
      },
      {
        id: 'copy_link',
        title: i18n.t('copyLink'),
        systemImage: 'link',
        onPress: () => void copyLink(),
      },
      {
        id: 'share',
        title: i18n.t('shareEllipsis'),
        systemImage: 'square.and.arrow.up',
        onPress: () => void shareUrl(url, label).catch(() => {}),
      },
    ],
  ]
}
