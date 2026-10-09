import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { Asset } from 'expo-asset'
import { Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter'
import type { EditorFonts } from '@/components/richText/editor/editorProtocol'
import { noteImagePath } from '@/lib/richText/noteImages'

/*
 * Files the editor's web page loads. A release build loads the page from a
 * file, so it can read photos and fonts from disk directly. In development the
 * page comes from Metro over http, which can't load file:// URLs: photos are
 * sent inline (scaled down) and the editor falls back to system fonts.
 */

const DEV_IMAGE_SIDE = 1024

async function inlineImage(id: string): Promise<string> {
  const scaled = await ImageManipulator.manipulateAsync(
    noteImagePath(id),
    [{ resize: { width: DEV_IMAGE_SIDE } }],
    {
      compress: 0.6,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  )
  void FileSystem.deleteAsync(scaled.uri, { idempotent: true })
  return `data:image/jpeg;base64,${scaled.base64}`
}

/** A URL the editor's page can show the photo from; '' when it's missing. */
export async function editorImageSource(id: string): Promise<string> {
  try {
    return __DEV__ ? await inlineImage(id) : noteImagePath(id)
  } catch {
    return ''
  }
}

export async function editorImageSources(
  ids: string[]
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    ids.map(async (id) => [id, await editorImageSource(id)] as const)
  )
  return Object.fromEntries(entries.filter(([, src]) => src))
}

let fonts: Promise<EditorFonts> | undefined

/** Inter for the editor, so it reads like the note does everywhere else. */
export function editorFonts(): Promise<EditorFonts> {
  if (__DEV__) return Promise.resolve({})
  fonts ??= Promise.all(
    [
      Inter_400Regular,
      Inter_700Bold,
      require('@/assets/fonts/Inter_400Regular_Italic.ttf'),
      require('@/assets/fonts/Inter_700Bold_Italic.ttf'),
    ].map(async (module: number) => {
      const asset = Asset.fromModule(module)
      await asset.downloadAsync()
      return asset.localUri ?? undefined
    })
  )
    .then(([regular, bold, italic, boldItalic]) => ({
      regular,
      bold,
      italic,
      boldItalic,
    }))
    .catch(() => {
      fonts = undefined
      return {}
    })
  return fonts
}
