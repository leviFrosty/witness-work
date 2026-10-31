import {
  clampRect,
  exceedsPixelLimit,
  fitWithin,
  type PixelRect,
} from '@/lib/files/imageSizing'

/**
 * Why the browser couldn't use a picked file as a photo: it isn't an image,
 * it's a format this browser can't open (HEIC outside Safari), or it has too
 * many pixels to open safely.
 */
export class UnsupportedImageError extends Error {
  readonly reason: 'unsupported' | 'tooLarge'
  constructor(reason: 'unsupported' | 'tooLarge') {
    super(`Unusable image: ${reason}`)
    this.name = 'UnsupportedImageError'
    this.reason = reason
  }
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new UnsupportedImageError('unsupported'))
    image.src = url
  })

/**
 * Opens an image file (or a `blob:` or `data:` URL of one) as `<img>` does,
 * applying its EXIF orientation, and hands the image and its size to `run`. An
 * object URL made here is revoked afterwards. Refuses non-images, formats this
 * browser can't decode, and photos over the pixel limit.
 */
async function withImage<T>(
  source: Blob | string,
  run: (
    image: HTMLImageElement,
    size: { width: number; height: number }
  ) => T | Promise<T>
): Promise<T> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source)
  try {
    const image = await loadImage(url)
    const { naturalWidth: width, naturalHeight: height } = image
    if (!width || !height) throw new UnsupportedImageError('unsupported')
    if (exceedsPixelLimit(width, height))
      throw new UnsupportedImageError('tooLarge')
    return await run(image, { width, height })
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(url)
  }
}

/** The pixel size of an image, as the browser shows it. */
export function readImageSize(source: Blob | string) {
  return withImage(source, (_image, size) => size)
}

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      type,
      quality
    )
  })

export type RenderedJpeg = { blob: Blob; width: number; height: number }

/**
 * Re-encodes an image file as JPEG: `crop` (in source pixels) if given, scaled
 * down so its longer side is at most `maxSide`. Draws the part it needs
 * straight to a canvas of the final size, so a huge photo never needs a canvas
 * of its own size. Transparent pixels turn white, as JPEG has no alpha.
 */
export function renderJpeg(
  source: Blob | string,
  options: { crop?: PixelRect; maxSide: number; quality: number }
): Promise<RenderedJpeg> {
  return withImage(source, async (image, full) => {
    const crop = options.crop
      ? clampRect(options.crop, full)
      : { originX: 0, originY: 0, ...full }
    const size = fitWithin(crop.width, crop.height, options.maxSide)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    try {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No canvas')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, size.width, size.height)
      context.imageSmoothingQuality = 'high'
      context.drawImage(
        image,
        crop.originX,
        crop.originY,
        crop.width,
        crop.height,
        0,
        0,
        size.width,
        size.height
      )
      return {
        blob: await canvasToBlob(canvas, 'image/jpeg', options.quality),
        ...size,
      }
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  })
}

/** A `data:` URL holding `blob`'s bytes, read without a network request. */
export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
    reader.readAsDataURL(blob)
  })
