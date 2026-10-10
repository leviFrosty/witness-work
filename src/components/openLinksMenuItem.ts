import type { ContextMenuItem } from '@/components/ui/ContextMenu.types'
import { findLinks, getHostname } from '@/lib/linkPreview'
import i18n from '@/lib/locales'

/**
 * Open Link for a host whose note shows its links as plain content: one action
 * for a single link, a submenu of hostnames for several.
 */
export function openLinksMenuItem(
  text: string | null | undefined,
  open: (url: string) => void
): ContextMenuItem | null {
  const links = text ? findLinks(text) : []
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
