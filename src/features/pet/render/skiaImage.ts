import {
  AlphaType,
  ColorType,
  ImageFormat,
  Skia,
  type SkImage,
} from '@shopify/react-native-skia'

import type { PixelBuffer } from '@/lib/pixelArt'

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

export function bufferToPngBase64(buffer: PixelBuffer): string | null {
  const image = bufferToSkImage(buffer)
  if (!image) return null
  return image.encodeToBase64(ImageFormat.PNG, 100)
}
