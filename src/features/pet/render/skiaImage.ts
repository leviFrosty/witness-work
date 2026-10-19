import {
  AlphaType,
  ColorType,
  ImageFormat,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia'

import type { PixelBuffer } from '@/lib/pixelArt'

/**
 * Uploads a pixel buffer as a Skia image. Pixels are opaque or empty, so
 * unpremultiplied RGBA is exact. Returns null if Skia can't make the image.
 */
export function bufferToSkImage(buffer: PixelBuffer): SkImage | null {
  const data = Skia.Data.fromBytes(
    new Uint8Array(
      buffer.data.buffer,
      buffer.data.byteOffset,
      buffer.data.byteLength
    )
  )
  return Skia.Image.MakeImage(
    {
      width: buffer.width,
      height: buffer.height,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    },
    data,
    buffer.width * 4
  )
}

/** Encodes a pixel buffer as a base64 PNG, or null if Skia can't. */
export function bufferToPngBase64(buffer: PixelBuffer): string | null {
  const image = bufferToSkImage(buffer)
  if (!image) return null
  return image.encodeToBase64(ImageFormat.PNG, 100)
}
