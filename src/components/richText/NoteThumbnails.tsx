import { View } from 'react-native'
import { Image } from 'expo-image'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useNoteImageUri } from '@/lib/richText/noteImageRevision'
import type { RichTextImageAttrs } from '@/types/richText'

const SIZE = 44
const MAX_SHOWN = 4

function Thumbnail(props: { id: string }) {
  const uri = useNoteImageUri(props.id)
  return (
    <Image
      source={{ uri }}
      style={{ width: SIZE, height: SIZE }}
      contentFit='cover'
      recyclingKey={props.id}
    />
  )
}

/** A row of a note's photos, small, for previews that leave photos out. */
const NoteThumbnails = (props: { images: RichTextImageAttrs[] }) => {
  const theme = useTheme()
  const shown = props.images.slice(0, MAX_SHOWN)
  const more = props.images.length - shown.length
  if (!shown.length) return null
  return (
    <View
      style={{ flexDirection: 'row', gap: 6 }}
      accessible
      accessibilityLabel={
        // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
        i18n.t('richText_photoCount', { count: props.images.length })
      }
    >
      {shown.map((image, index) => (
        <View
          key={image.id}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: theme.numbers.borderRadiusSm,
            overflow: 'hidden',
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <Thumbnail id={image.id} />
          {more > 0 && index === shown.length - 1 && (
            <View
              style={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.45)',
              }}
            >
              <Text style={{ color: '#fff', fontFamily: theme.fonts.semiBold }}>
                {`+${more}`}
              </Text>
            </View>
          )}
        </View>
      ))}
    </View>
  )
}

export default NoteThumbnails
