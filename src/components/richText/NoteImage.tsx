import { useState } from 'react'
import { View } from 'react-native'
import { Image } from 'expo-image'
import { ImageOff as ImageOffIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useNoteImageUri } from '@/lib/richText/noteImageRevision'
import type { RichTextImageAttrs } from '@/types/richText'

const MAX_HEIGHT = 360

/**
 * A photo in a note at its own aspect ratio, centered: its share of the note's
 * width once resized, otherwise full width when landscape and up to
 * `MAX_HEIGHT` tall when portrait. A photo whose file isn't on this device (not
 * synced yet, or photo sync is off) shows a placeholder instead.
 */
const NoteImage = (props: {
  image: RichTextImageAttrs
  onPress?: () => void
}) => {
  const theme = useTheme()
  const uri = useNoteImageUri(props.image.id)
  const [failedUri, setFailedUri] = useState<string | null>(null)
  const ratio = props.image.width / props.image.height
  const { scale } = props.image
  const frame = {
    aspectRatio: ratio,
    maxWidth: '100%' as const,
    alignSelf: 'center' as const,
    borderRadius: theme.numbers.borderRadiusMd,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.backgroundLighter,
    ...(scale
      ? { width: `${scale * 100}%` as const }
      : ratio < 1
        ? { height: MAX_HEIGHT }
        : { width: '100%' as const }),
  }

  if (failedUri === uri) {
    return (
      <View
        style={[
          frame,
          {
            maxHeight: 160,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: 12,
          },
        ]}
        accessibilityRole='image'
        accessibilityLabel={i18n.t('richText_photoMissing')}
      >
        <ImageOffIcon size={22} color={theme.colors.textAlt} />
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            textAlign: 'center',
          }}
        >
          {i18n.t('richText_photoMissing')}
        </Text>
      </View>
    )
  }

  const image = (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: '100%' }}
      contentFit='cover'
      recyclingKey={props.image.id}
      transition={120}
      onError={() => setFailedUri(uri)}
      accessibilityIgnoresInvertColors
    />
  )

  if (!props.onPress) {
    return (
      <View
        style={frame}
        accessible
        accessibilityRole='image'
        accessibilityLabel={i18n.t('richText_photo')}
      >
        {image}
      </View>
    )
  }

  return (
    <Button
      onPress={props.onPress}
      style={frame}
      accessibilityRole='imagebutton'
      accessibilityLabel={i18n.t('richText_photo')}
      accessibilityHint={i18n.t('richText_photoHint')}
    >
      {image}
    </Button>
  )
}

export default NoteImage
