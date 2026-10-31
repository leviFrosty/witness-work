import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { Asset } from 'expo-asset'
import { Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter'
import type { EditorFonts } from '@/components/richText/editor/editorProtocol'
import { noteImagePath } from '@/lib/richText/noteImages'

/*
 * Files the editor's web page loads. Photos are always sent inline (scaled
 * down): in development the page comes from Metro over http, which can't load
 * file:// URLs, and on an iPhone the web view's sandbox can't read the app's
 * Documents folder even when the page itself loads from a file. Fonts live in
 * the app bundle beside the page, so release builds read those from disk; in
 * development the editor falls back to system fonts.
 */

const IMAGE_SIDE = 1200

async function inlineImage(id: string): Promise<string> {
  if (Platform.OS === 'web') {
    const { blobToDataUrl, renderJpeg } = await import('@/lib/files/webImages')
    const { blob } = await renderJpeg(noteImagePath(id), {
      maxSide: IMAGE_SIDE,
      quality: 0.7,
    })
    return blobToDataUrl(blob)
  }
  const scaled = await ImageManipulator.manipulateAsync(
    noteImagePath(id),
    [{ resize: { width: IMAGE_SIDE } }],
    {
      compress: 0.7,
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
    return await inlineImage(id)
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
