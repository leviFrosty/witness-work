import { PixelRatio, View } from 'react-native'
import {
  Canvas,
  FilterMode,
  Image,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia'
import i18n from '@/lib/locales'
import { createLru } from '@/lib/pixelArt'
import { HEART_ICON_H, HEARTS_ROW_W, heartsRow } from '@/features/pet/art'
import { crispScale } from '@/features/pet/render/crispScale'
import { bufferToSkImage } from '@/features/pet/render/skiaImage'

const SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None }

const rows = createLru<SkImage | null>(24)

/** Five pixel hearts for `hearts` (halves allowed) in one image. */
function heartsImage(hearts: number, gold: boolean): SkImage | null {
  return rows.getOrCreate(`${hearts}|${gold ? 1 : 0}`, () =>
    bufferToSkImage(heartsRow(hearts, gold))
  )
}

/**
 * The pet's hearts as five pixel hearts, red or gold, with halves. One
 * accessibility element: "N of 5 hearts".
 */
export default function PixelHearts({
  hearts,
  gold = false,
  height = 10,
}: {
  /** 0–5 in half steps. */
  hearts: number
  gold?: boolean
  /** Target height in points; snapped to whole device pixels. */
  height?: number
}) {
  const scale = crispScale(height, HEART_ICON_H, PixelRatio.get())
  const width = HEARTS_ROW_W * scale
  const h = HEART_ICON_H * scale
  return (
    <View
      accessible
      accessibilityRole='image'
      accessibilityLabel={i18n.t('pet.a11y.hearts', { count: hearts })}
      style={{ width, height: h }}
    >
      <Canvas style={{ width, height: h }} pointerEvents='none'>
        <Image
          image={heartsImage(hearts, gold)}
          x={0}
          y={0}
          width={width}
          height={h}
          sampling={SAMPLING}
        />
      </Canvas>
    </View>
  )
}
