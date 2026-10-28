import { useState, type ReactNode } from 'react'
import {
  PixelRatio,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  Canvas,
  FilterMode,
  Image,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia'
import { createLru, type PixelBuffer } from '@/lib/pixelArt'
import {
  cssColor,
  coinIcon,
  gameFrame,
  gamePaper,
  type CoinIconSize,
  type GameFrameKind,
  type GamePalette,
} from '@/features/pet/art/gameUi'
import { crispScale, pixelsIn } from '@/features/pet/render/crispScale'
import { bufferToSkImage } from '@/features/pet/render/skiaImage'

const SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None }

/** About how big one of the Shop's pixels is, in points. */
const SHOP_PIXEL_PT = 2.4

/** Points per Shop pixel, a whole number of device pixels. */
export const gamePixelScale = (): number =>
  crispScale(SHOP_PIXEL_PT, 1, PixelRatio.get())

// Frames come in a few sizes per screen; icons and backgrounds in fewer.
const images = createLru<SkImage | null>(96)

/** `make()` as a Skia image, kept under `key`. */
const cachedImage = (key: string, make: () => PixelBuffer): SkImage | null =>
  images.getOrCreate(key, () => bufferToSkImage(make()))

/** A pixel image drawn at the Shop's scale. */
export function GamePixelImage({
  cacheKey,
  make,
  scale = gamePixelScale(),
  style,
}: {
  /** Names the image, so it's drawn once. */
  cacheKey: string
  make: () => PixelBuffer
  scale?: number
  style?: StyleProp<ViewStyle>
}) {
  const image = cachedImage(cacheKey, make)
  if (!image) return null
  const width = image.width() * scale
  const height = image.height() * scale
  return (
    <View style={[{ width, height }, style]} pointerEvents='none'>
      <Canvas style={{ width, height }}>
        <Image
          image={image}
          x={0}
          y={0}
          width={width}
          height={height}
          sampling={SAMPLING}
        />
      </Canvas>
    </View>
  )
}

/** The currency's pixel icon: a gold coin. */
export function CoinIcon({
  size = 'small',
  scale,
  style,
}: {
  size?: CoinIconSize
  /** Points per pixel; the Shop's by default. */
  scale?: number
  style?: StyleProp<ViewStyle>
}) {
  return (
    <GamePixelImage
      cacheKey={`coin|${size}`}
      make={() => coinIcon(size)}
      scale={scale}
      style={style}
    />
  )
}

/** The pixel size of a measured box, and the points it covers. */
function useMeasured(scale: number) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    const w = pixelsIn(width, scale)
    const h = pixelsIn(height, scale)
    setSize((last) => (last.w === w && last.h === h ? last : { w, h }))
  }
  return { ...size, onLayout }
}

/** A pixel image filling the top-left of its parent, behind its siblings. */
function Backdrop({
  image,
  w,
  h,
  scale,
}: {
  image: SkImage | null
  w: number
  h: number
  scale: number
}) {
  if (!image) return null
  return (
    <Canvas
      pointerEvents='none'
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: w * scale,
        height: h * scale,
      }}
    >
      <Image
        image={image}
        x={0}
        y={0}
        width={w * scale}
        height={h * scale}
        sampling={SAMPLING}
      />
    </Canvas>
  )
}

/**
 * A view with pixel art behind its children, drawn by `make` to the view's size
 * whatever it is, the way a 9-slice frame stretches.
 */
export function GameArtBox({
  cacheKey,
  make,
  style,
  children,
}: {
  /** Names the art apart from its size. */
  cacheKey: string
  make: (w: number, h: number) => PixelBuffer
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}) {
  const scale = gamePixelScale()
  const { w, h, onLayout } = useMeasured(scale)
  const image =
    w > 0 && h > 0
      ? cachedImage(`${cacheKey}|${w}|${h}`, () => make(w, h))
      : null
  return (
    <View onLayout={onLayout} style={style}>
      <Backdrop image={image} w={w} h={h} scale={scale} />
      {children}
    </View>
  )
}

/** A view with one of the Shop's pixel frames behind its children. */
export function GameFrame({
  kind,
  palette,
  style,
  children,
}: {
  kind: GameFrameKind
  palette: GamePalette
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}) {
  return (
    <GameArtBox
      cacheKey={`frame|${kind}|${palette.dark ? 1 : 0}`}
      make={(w, h) => gameFrame(palette, kind, w, h)}
      style={style}
    >
      {children}
    </GameArtBox>
  )
}

/** The Shop's washi paper, filling the view behind its children. */
export function GamePaper({
  palette,
  style,
  children,
}: {
  palette: GamePalette
  style?: StyleProp<ViewStyle>
  children?: ReactNode
}) {
  const scale = gamePixelScale()
  const { w, h, onLayout } = useMeasured(scale)
  // Covers the leftover sliver past the last whole pixel too.
  const image =
    w > 0 && h > 0
      ? cachedImage(`paper|${palette.dark ? 1 : 0}|${w + 1}|${h + 1}`, () =>
          gamePaper(palette, w + 1, h + 1)
        )
      : null
  return (
    <View
      onLayout={onLayout}
      style={[{ backgroundColor: cssColor(palette.paper) }, style]}
    >
      <Backdrop image={image} w={w + 1} h={h + 1} scale={scale} />
      {children}
    </View>
  )
}
