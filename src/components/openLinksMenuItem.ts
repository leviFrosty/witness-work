import type { ContextMenuItem } from '@/components/ui/ContextMenu.types'
import { getHostname } from '@/lib/linkPreview'
import i18n from '@/lib/locales'

export function openLinksMenuItem(
  links: string[],
  open: (url: string) => void
): ContextMenuItem | null {
  if (links.length === 0) return null
  if (links.length === 1) {
    return {
      id: 'open_link',
      title: i18n.t('openLink'),
      systemImage: 'safari',
      onPress: () => open(links[0]!),
    }
  }
  return {
    id: 'open_link',
    title: i18n.t('openLink'),
    systemImage: 'safari',
    actions: links.map((url, index) => ({
      id: `link_${index}`,
      title: getHostname(url),
      onPress: () => open(url),
    })),
  }
}
