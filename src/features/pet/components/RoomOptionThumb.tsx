import { PixelRatio, View } from 'react-native'
import {
  Canvas,
  FilterMode,
  Image,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia'
import {
  createLru,
  crop,
  type PixelBuffer,
  type Viewport,
} from '@/lib/pixelArt'
import {
  composeScene,
  silhouetteOf,
  type SceneInput,
  type SilhouetteStyle,
} from '@/features/pet/art'
import { crispScale } from '@/features/pet/render/crispScale'
import { bufferToSkImage } from '@/features/pet/render/skiaImage'

const SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None }

// Every tab's thumbnails (about 130 with the secrets), and a few room changes.
const thumbs = createLru<SkImage | null>(160)
// The rooms locked secrets are compared with. A part's secrets share some of
// them (the hatless room, the regular options), drawn once for all of them.
const references = createLru<PixelBuffer>(24)

const still = (input: SceneInput, view: Viewport): PixelBuffer =>
  crop(composeScene(input, 0), view)

const referenceStill = (input: SceneInput, view: Viewport): PixelBuffer =>
  references.getOrCreate(JSON.stringify([input, view]), () =>
    still(input, view)
  )

/** A locked secret's thumbnail: its shape against `references`. */
export type ThumbSilhouette = {
  references: readonly SceneInput[]
  style: SilhouetteStyle
}

function thumbImage(
  input: SceneInput,
  view: Viewport,
  silhouette?: ThumbSilhouette
): SkImage | null {
  return thumbs.getOrCreate(JSON.stringify([input, view, silhouette]), () => {
    const shown = still(input, view)
    if (!silhouette) return bufferToSkImage(shown)
    return bufferToSkImage(
      silhouetteOf(
        shown,
        silhouette.references.map((ref) => referenceStill(ref, view)),
        silhouette.style
      )
    )
  })
}

/**
 * A still of part of the room (`view` of the 180 × 100 scene) as `input` draws
 * it, filling `width` with every pixel square (the edges may clip by a few
 * points), or only its silhouette. Thumbnails are cached, so re-renders don't
 * redraw the room.
 */
export default function RoomOptionThumb({
  input,
  view,
  width,
  silhouette,
}: {
  input: SceneInput
  view: Viewport
  /** The cell's width in points. */
  width: number
  /** Draws only the option's shape (a locked secret). */
  silhouette?: ThumbSilhouette
}) {
  const ratio = PixelRatio.get()
  let scale = crispScale(width, view[2], ratio)
  // Fill the cell: a little of the edges is clipped rather than leaving gaps.
  if (scale * view[2] < width) scale += 1 / ratio
  const w = scale * view[2]
  const h = scale * view[3]
  const image = width > 0 ? thumbImage(input, view, silhouette) : null

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
