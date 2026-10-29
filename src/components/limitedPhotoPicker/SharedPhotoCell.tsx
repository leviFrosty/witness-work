import { View } from 'react-native'
import { Image } from 'expo-image'
import type { AssetMetadata } from 'expo-media-library'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'

const BADGE_SIZE = 24

type Props = {
  photo: AssetMetadata
  size: number
  /** Where it falls in the selection, from 1; null when it isn't selected. */
  order: number | null
  /** Tapping picks it right away rather than toggling it. */
  single: boolean
  disabled: boolean
  onPress: () => void
}

/** One shared photo in the limited-access picker's grid. */
export default function SharedPhotoCell({
  photo,
  size,
  order,
  single,
  disabled,
  onPress,
}: Props) {
  const theme = useTheme()
  const selected = order !== null

  return (
    <Button
      noTransform
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={single ? 'button' : 'checkbox'}
      accessibilityState={single ? { disabled } : { checked: selected }}
      accessibilityLabel={
        photo.creationTime
          ? i18n.t('photoPicker_photoTaken', {
              date: formatDate(photo.creationTime),
            })
          : i18n.t('photoPicker_photo')
      }
      style={{ width: size, height: size }}
    >
      <Image
        source={{ uri: photo.id }}
        recyclingKey={photo.id}
        contentFit='cover'
        transition={120}
        style={{
          width: size,
          height: size,
          backgroundColor: theme.colors.backgroundLighter,
        }}
      />
      {selected && (
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            inset: 0,
            borderWidth: 3,
            borderColor: theme.colors.accent,
          }}
        >
          <View
            style={{
              position: 'absolute',
              right: 6,
              bottom: 6,
              width: BADGE_SIZE,
              height: BADGE_SIZE,
              borderRadius: BADGE_SIZE / 2,
              backgroundColor: theme.colors.accent,
              borderWidth: 2,
              borderColor: theme.colors.textInverse,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: theme.colors.textInverse,
                fontSize: 12,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {order}
            </Text>
          </View>
        </View>
      )}
    </Button>
  )
}
