import { useRef, useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as TextRecognition from '../../../../modules/text-recognition'
import Haptics from '@/lib/haptics'
import { logger } from '@/lib/logger'
import useLibraryImagePicker from '@/hooks/useLibraryImagePicker'
import type { ScribePhotoCapture } from '@/features/scribe/types'
import { appLocale } from '@/features/scribe/lib/locale'
import { layoutRecognizedPages } from '@/features/scribe/lib/recognizedTextLayout'
import { trackCaptureFinished } from '@/features/scribe/analytics'

/** Photos per pick from the library. */
export const SCRIBE_PHOTO_MAX_IMAGES = 5

async function cameraAllowed(): Promise<boolean> {
  let permission = await ImagePicker.getCameraPermissionsAsync()
  if (!permission.granted && permission.canAskAgain)
    permission = await ImagePicker.requestCameraPermissionsAsync()
  return permission.granted
}

/**
 * Scan notes (ADR 0018): the document camera where there is one (the photo
 * library where there isn't, or the camera is refused), read on-device. Images
 * never leave the device; the library's copies are deleted once read.
 */
export function useScribePhotoCapture(): ScribePhotoCapture {
  const available = TextRecognition.isSupported()
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const library = useLibraryImagePicker('scribe_photo')

  const options = () => ({ languages: [appLocale()] })

  const deliver = (text: string, pages: number): string | null => {
    const final = text.trim()
    trackCaptureFinished({
      input: 'photo',
      outcome: final ? 'done' : 'empty',
      pages,
    })
    if (!final) return null
    void Haptics.success()
    return final
  }

  const scan = async (): Promise<string | null | undefined> => {
    if (
      !TextRecognition.isDocumentScannerSupported() ||
      !(await cameraAllowed())
    )
      return undefined
    // Shown beneath the document camera, so reading feels continuous.
    setBusy(true)
    const pages = await TextRecognition.scanDocument(options())
    if (!pages) return null
    return deliver(layoutRecognizedPages(pages), pages.length)
  }

  const choose = async (): Promise<string | null> => {
    let uris: string[] = []
    try {
      const result = await library.pick({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: SCRIBE_PHOTO_MAX_IMAGES,
        orderedSelection: true,
        quality: 1,
      })
      if (result.canceled || !result.assets.length) return null
      uris = result.assets.map((asset) => asset.uri)
      setBusy(true)
      const pages = []
      for (const uri of uris)
        pages.push(await TextRecognition.recognizeImage(uri, options()))
      return deliver(layoutRecognizedPages(pages), pages.length)
    } finally {
      // They hold the User's private notes.
      for (const uri of uris)
        void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
    }
  }

  const capture = async (): Promise<string | null> => {
    if (!available || running.current) return null
    running.current = true
    try {
      const scanned = await scan()
      return scanned === undefined ? await choose() : scanned
    } catch (error) {
      logger.warn('[scribe] photo capture failed', error)
      trackCaptureFinished({
        input: 'photo',
        outcome: 'error',
        errorCode: 'failed',
      })
      return null
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return { available, busy, capture, picker: library.host }
}
