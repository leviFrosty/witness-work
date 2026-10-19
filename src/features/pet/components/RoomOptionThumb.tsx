import { PixelRatio, View } from 'react-native'
import {
  Canvas,
  FilterMode,
  Image,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia'
import { createLru, crop, type Viewport } from '@/lib/pixelArt'
import { composeScene, type SceneInput } from '@/features/pet/art'
import { crispScale } from '@/features/pet/render/crispScale'
import { bufferToSkImage } from '@/features/pet/render/skiaImage'

const SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None }

// A sheet's worth of thumbnails across a few tabs and room changes.
const thumbs = createLru<SkImage | null>(96)

function thumbImage(input: SceneInput, view: Viewport): SkImage | null {
  return thumbs.getOrCreate(JSON.stringify([input, view]), () =>
    bufferToSkImage(crop(composeScene(input, 0), view))
  )
}

/**
 * A still of part of the room (`view` of the 180 × 100 scene) as `input` draws
 * it, filling `width` with every pixel square (the edges may clip by a few
 * points). Thumbnails are cached, so re-renders don't redraw the room.
 */
export default function RoomOptionThumb({
  input,
  view,
  width,
}: {
  input: SceneInput
  view: Viewport
  /** The cell's width in points. */
  width: number
}) {
  const ratio = PixelRatio.get()
  let scale = crispScale(width, view[2], ratio)
  // Fill the cell: a little of the edges is clipped rather than leaving gaps.
  if (scale * view[2] < width) scale += 1 / ratio
  const w = scale * view[2]
  const h = scale * view[3]
  const image = width > 0 ? thumbImage(input, view) : null

  return (
    <View
      style={{
        width,
        height: h,
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {image && (
        <Canvas style={{ width: w, height: h }} pointerEvents='none'>
          <Image
            image={image}
            x={0}
            y={0}
            width={w}
            height={h}
            sampling={SAMPLING}
          />
        </Canvas>
      )}
    </View>
  )
}
