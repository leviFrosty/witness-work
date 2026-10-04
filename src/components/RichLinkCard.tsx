import { useState } from 'react'
import { ActivityIndicator, Platform, Share, View } from 'react-native'
import { Image } from 'expo-image'
import * as Clipboard from 'expo-clipboard'
import { useToastController } from '@tamagui/toast'
import { Link as LinkIcon } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { openURL } from '@/lib/links'
import { getHostname, isHttpUrl } from '@/lib/linkPreview'
import { useLinkPreview } from '@/hooks/useLinkPreview'

const THUMBNAIL_SIZE = 56

/** Shared tap / menu behavior for links in notes. */
export function useLinkActions() {
  const toast = useToastController()

  const open = (url: string) => {
    if (!isHttpUrl(url)) return
    void openURL(url)
  }

  const copyText = async (text: string, message = i18n.t('copied')) => {
    Haptics.success().catch(() => {})
    try {
      await Clipboard.setStringAsync(text)
      toast.show(message, { native: true, duration: 2000 })
    } catch {
      Haptics.error().catch(() => {})
    }
  }

  const copy = (url: string) => copyText(url, i18n.t('linkCopied'))

  const share = (url: string) => {
    // iOS shares the URL itself (rich previews); Android only takes text.
    void Share.share(Platform.OS === 'ios' ? { url } : { message: url })
  }

  /** Open / Copy Link / Share… — the context menu for any link. */
  const menu = (url: string): ContextMenuEntries => [
    isHttpUrl(url) && {
      id: 'open',
      title: i18n.t('open'),
      systemImage: 'safari',
      onPress: () => open(url),
    },
    {
      id: 'copy_link',
      title: i18n.t('copyLink'),
      systemImage: 'doc.on.doc',
      onPress: () => void copy(url),
    },
    {
      id: 'share',
      title: i18n.t('shareEllipsis'),
      systemImage: 'square.and.arrow.up',
      onPress: () => share(url),
    },
  ]

  return { open, copy, copyText, share, menu }
}

interface Props {
  url: string
  /**
   * Off when the card sits inside another long-press target (e.g. a Plan row):
   * it then renders as plain content, and the host folds Open Link into its own
   * menu.
   */
  interactive?: boolean
}

const RichLinkCard = ({ url, interactive = true }: Props) => {
  const theme = useTheme()
  const { preview, loading } = useLinkPreview(url)
  const { open, menu } = useLinkActions()
  const [imageFailed, setImageFailed] = useState<string | null>(null)

  const hostname = getHostname(url)
  const title = preview?.title || hostname
  const siteName = preview?.siteName
  const subtitle =
    siteName && siteName.toLowerCase() !== hostname
      ? `${siteName} · ${hostname}`
      : hostname
  const imageUrl =
    preview?.imageUrl && imageFailed !== preview.imageUrl
      ? preview.imageUrl
      : undefined
  const showThumbnail = loading || !!imageUrl

  const card = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 8,
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      {showThumbnail ? (
        <View
          style={{
            width: THUMBNAIL_SIZE,
            height: THUMBNAIL_SIZE,
            borderRadius: theme.numbers.borderRadiusSm,
            backgroundColor: theme.colors.background,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }}
              contentFit='cover'
              transition={150}
              accessibilityIgnoresInvertColors
              onError={() => setImageFailed(imageUrl)}
            />
          ) : (
            <ActivityIndicator size='small' color={theme.colors.textAlt} />
          )}
        </View>
      ) : (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: theme.numbers.borderRadiusSm,
            backgroundColor: theme.colors.background,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LinkIcon size={18} color={theme.colors.textAlt} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  )

  if (!interactive) return card

  return (
    <ContextMenu
      actions={menu(url)}
      onPress={() => open(url)}
      accessibilityLabel={title}
    >
      {card}
    </ContextMenu>
  )
}

export default RichLinkCard
