import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import useTheme from '@/contexts/theme'
import { snapshotImages } from '@/features/updates/lib/helpCenter/snapshotImages'
import type { RichTextImageAttrs } from '@/types/richText'

const MAX_WIDTH = 260

const HelpImage = (props: { image: RichTextImageAttrs; maxWidth: number }) => {
  const theme = useTheme()
  const [failed, setFailed] = useState(false)
  const { src, alt } = props.image
  if (!src || failed) return null

  const name = src.slice(src.lastIndexOf('/') + 1)
  const width = Math.min(MAX_WIDTH, (props.maxWidth || MAX_WIDTH) * 0.8)
  const height = Math.round((width * props.image.height) / props.image.width)
  return (
    <View style={{ paddingVertical: 4 }}>
      <Image
        source={snapshotImages[name] ?? { uri: src }}
        cachePolicy='disk'
        recyclingKey={src}
        transition={150}
        accessible
        accessibilityRole='image'
        accessibilityLabel={alt}
        onError={() => setFailed(true)}
        style={{
          width,
          height,
          borderRadius: 18,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.backgroundLighter,
        }}
      />
    </View>
  )
}

export default HelpImage
