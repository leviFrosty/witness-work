import { useEffect, useState } from 'react'
import { PixelRatio } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import {
  ClipOp,
  FilterMode,
  FontWeight,
  ImageFormat,
  MipmapMode,
  Skia,
  TextAlign,
  type SkCanvas,
} from '@shopify/react-native-skia'
import useTheme from '@/contexts/theme'
import { isRenderableImageValue } from '@/components/ui/Avatar'
import { MENU_IMAGE_SIZE } from '@/components/ui/menuEntries'
import type { MenuImage } from '@/components/ui/ContextMenu.types'
import { stripCacheBuster } from '@/lib/contactAvatarFiles'
import { logger } from '@/lib/logger'
import type { ProfileAvatar } from '@/types/avatar'

type Look = {
  avatar: ProfileAvatar
  initial: string
  background: string
  foreground: string
}
export default function useMenuAvatarImage(
  avatar: ProfileAvatar,
  name?: string
): MenuImage | null {
  const theme = useTheme()
  const { type, value, revision } = avatar
  const initial = (name ?? '').trim().charAt(0).toUpperCase()
  const background = theme.colors.accentBackground
  const foreground = theme.colors.textInverse
  const key = lookKey({ avatar, initial, background, foreground })
  const [image, setImage] = useState<{ key: string; image: MenuImage }>()

  useEffect(() => {
    const look: Look = {
      avatar: { type, value, revision },
      initial,
      background,
      foreground,
    }
    if (!hasMenuAvatar(look)) return
    let current = true
    void renderMenuAvatar(look, key).then((rendered) => {
      if (current && rendered) setImage({ key, image: rendered })
    })
    return () => {
      current = false
    }
  }, [key, type, value, revision, initial, background, foreground])

  return image?.key === key ? image.image : null
}

function hasMenuAvatar({ avatar, initial }: Look): boolean {
  if (avatar.type === 'image') return isRenderableImageValue(avatar.value)
  if (avatar.type === 'emoji') return !!avatar.value
  return !!initial
}

function lookKey({ avatar, initial, background, foreground }: Look): string {
  const source =
    avatar.type === 'image'
      ? `${avatar.value}#${avatar.revision ?? ''}`
      : avatar.type === 'emoji' && avatar.value
        ? avatar.value
        : `${initial}|${foreground}`
  return `${avatar.type}|${source}|${background}|${PixelRatio.get()}`
}

const rendered = new Map<string, Promise<MenuImage | null>>()

function renderMenuAvatar(look: Look, key: string) {
  let pending = rendered.get(key)
  if (!pending) {
    pending = drawToFile(look, key).catch((error: unknown) => {
      logger.error('Failed to draw the menu avatar', error)
      rendered.delete(key)
      return null
    })
    rendered.set(key, pending)
  }
  return pending
}

async function drawToFile(look: Look, key: string): Promise<MenuImage | null> {
  const scale = PixelRatio.get()
  const px = Math.round(MENU_IMAGE_SIZE * scale)
  const surface = Skia.Surface.Make(px, px)
  if (!surface) return null
  const canvas = surface.getCanvas()
  canvas.clipPath(
    Skia.Path.Circle(px / 2, px / 2, px / 2),
    ClipOp.Intersect,
    true
  )

  const { avatar } = look
  if (avatar.type === 'image') {
    const data = await Skia.Data.fromURI(stripCacheBuster(avatar.value))
    const photo = Skia.Image.MakeImageFromEncoded(data)
    if (!photo) return null
    const side = Math.min(photo.width(), photo.height())
    canvas.drawImageRectOptions(
      photo,
      Skia.XYWHRect(
        (photo.width() - side) / 2,
        (photo.height() - side) / 2,
        side,
        side
      ),
      Skia.XYWHRect(0, 0, px, px),
      FilterMode.Linear,
      MipmapMode.Linear,
      Skia.Paint()
    )
  } else {
    canvas.drawColor(Skia.Color(look.background))
    if (avatar.type === 'emoji' && avatar.value) {
      drawCentered(canvas, avatar.value, px * 0.5, px, look.foreground)
    } else {
      drawCentered(canvas, look.initial, px * 0.42, px, look.foreground, true)
    }
  }

  const png = surface.makeImageSnapshot().encodeToBase64(ImageFormat.PNG, 100)
  const uri = `${FileSystem.cacheDirectory}menu-avatar-${hash(key)}.png`
  await FileSystem.writeAsStringAsync(uri, png, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return { uri, scale }
}

function drawCentered(
  canvas: SkCanvas,
  text: string,
  fontSize: number,
  px: number,
  color: string,
  bold = false
) {
  const paragraph = Skia.ParagraphBuilder.Make({ textAlign: TextAlign.Center })
    .pushStyle({
      fontSize,
      color: Skia.Color(color),
      fontStyle: { weight: bold ? FontWeight.SemiBold : FontWeight.Normal },
    })
    .addText(text)
    .build()
  paragraph.layout(px)
  paragraph.paint(canvas, 0, (px - paragraph.getHeight()) / 2)
}

function hash(value: string): string {
  let h = 5381
  for (let i = 0; i < value.length; i++)
    h = (Math.imul(h, 33) ^ value.charCodeAt(i)) >>> 0
  return h.toString(36)
}
