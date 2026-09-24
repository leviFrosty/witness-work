import { useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'
import { Image } from 'expo-image'
import * as Clipboard from 'expo-clipboard'
import { useToastController } from '@tamagui/toast'
import { Link as LinkIcon } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
import { openURL } from '@/lib/links'
import { getHostname, isHttpUrl } from '@/lib/linkPreview'
import { useLinkPreview } from '@/hooks/useLinkPreview'

const THUMBNAIL_SIZE = 56

/** Shared tap / long-press behavior for links in notes. */
export function useLinkActions() {
  const toast = useToastController()

  const open = (url: string) => {
    if (!isHttpUrl(url)) return
    void openURL(url)
  }

  const copy = async (url: string) => {
    Haptics.success().catch(() => {})
    try {
      await Clipboard.setStringAsync(url)
      toast.show(i18n.t('linkCopied'), { native: true, duration: 2000 })
    } catch {
      Haptics.error().catch(() => {})
    }
  }

  return { open, copy }
}

interface Props {
  url: string
}

const RichLinkCard = ({ url }: Props) => {
  const theme = useTheme()
  const { preview, loading } = useLinkPreview(url)
  const { open, copy } = useLinkActions()
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

  return (
    <Pressable
      accessibilityRole='link'
      accessibilityLabel={title}
      accessibilityHint={i18n.t('richLink_hint')}
      accessibilityState={{ busy: loading }}
      onPress={() => open(url)}
      onLongPress={() => void copy(url)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 8,
        borderRadius: theme.numbers.borderRadiusMd,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
        opacity: pressed ? 0.7 : 1,
      })}
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
    </Pressable>
  )
}

export default RichLinkCard
