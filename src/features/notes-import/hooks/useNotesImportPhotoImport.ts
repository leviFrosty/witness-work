import { useState } from 'react'
import { Alert, Linking } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import * as TextRecognition from '../../../../modules/text-recognition'
import { analytics } from '@/lib/analytics'
import Haptics from '@/lib/haptics'
import i18n, { _i18n } from '@/lib/locales'
import { logger } from '@/lib/logger'
import {
  PHOTO_IMPORT_MAX_IMAGES,
  toBcp47,
} from '@/features/notes-import/lib/notesImportCapture'
import { layoutRecognizedPages } from '@/features/notes-import/lib/recognizedTextLayout'

type PhotoSource = 'scan' | 'library'
type Outcome =
  | 'inserted'
  | 'empty'
  | 'cancelled'
  | 'failed'
  | 'permission_denied'

const report = (source: PhotoSource, outcome: Outcome, pageCount?: number) =>
  analytics.capture('notes_import_capture_finished', {
    method: 'photo',
    photo_source: source,
    outcome,
    ...(pageCount ? { page_count: pageCount } : {}),
  })

/**
 * Photo import (ADR 0018): scans pages with the document camera or picks
 * photos, reads printed text and handwriting on-device, and hands the text to
 * `onText` for the user to edit before importing. Images are never uploaded;
 * picked copies are deleted as soon as they're read.
 */
export function useNotesImportPhotoImport({
  onText,
}: {
  onText: (text: string) => void
}) {
  const supported = TextRecognition.isSupported()
  const scanSupported =
    supported && TextRecognition.isDocumentScannerSupported()
  const [reading, setReading] = useState(false)

  const options = () => ({ languages: [toBcp47(_i18n.locale)] })

  const deliver = (source: PhotoSource, text: string, pageCount: number) => {
    if (text.trim()) {
      report(source, 'inserted', pageCount)
      void Haptics.success()
      onText(text)
      return
    }
    report(source, 'empty', pageCount)
    Alert.alert(
      i18n.t('notesImport_photoEmptyTitle'),
      i18n.t('notesImport_photoEmptyBody')
    )
  }

  const fail = (source: PhotoSource, error: unknown) => {
    logger.warn('Photo import failed', error)
    report(source, 'failed')
    Alert.alert(
      i18n.t('notesImport_photoErrorTitle'),
      i18n.t('notesImport_error')
    )
  }

  const scan = async () => {
    if (!scanSupported || reading) return
    let permission = await ImagePicker.getCameraPermissionsAsync()
    if (!permission.granted && permission.canAskAgain) {
      permission = await ImagePicker.requestCameraPermissionsAsync()
    }
    if (!permission.granted) {
      report('scan', 'permission_denied')
      Alert.alert(
        i18n.t('notesImport_cameraDeniedTitle'),
        i18n.t('notesImport_cameraDeniedBody'),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          {
            text: i18n.t('notesImport_photoChoose'),
            onPress: () => void choose(),
          },
          {
            text: i18n.t('notesImport_openSettings'),
            onPress: () => void Linking.openSettings(),
          },
        ]
      )
      return
    }
    // Shown beneath the document camera, so recognition reads as continuous.
    setReading(true)
    try {
      const pages = await TextRecognition.scanDocument(options())
      if (!pages) {
        report('scan', 'cancelled')
        return
      }
      deliver('scan', layoutRecognizedPages(pages), pages.length)
    } catch (error) {
      fail('scan', error)
    } finally {
      setReading(false)
    }
  }

  const choose = async () => {
    if (!supported || reading) return
    let uris: string[] = []
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: PHOTO_IMPORT_MAX_IMAGES,
        orderedSelection: true,
        quality: 1,
      })
      if (result.canceled || !result.assets.length) {
        report('library', 'cancelled')
        return
      }
      uris = result.assets.map((asset) => asset.uri)
      setReading(true)
      const pages = []
      for (const uri of uris) {
        pages.push(await TextRecognition.recognizeImage(uri, options()))
      }
      deliver('library', layoutRecognizedPages(pages), pages.length)
    } catch (error) {
      fail('library', error)
    } finally {
      setReading(false)
      // The picker's copies hold the user's private notes; don't keep them.
      for (const uri of uris) {
        void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})
      }
    }
  }

  return { supported, scanSupported, reading, scan, choose }
}
