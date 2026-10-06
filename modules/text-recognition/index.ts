import { requireOptionalNativeModule } from 'expo-modules-core'

/**
 * On-device text recognition (ADR 0018). This file is the platform-neutral
 * contract: iOS implements it in `ios/` with Vision and the VisionKit document
 * camera. An Android implementation (e.g. ML Kit text recognition and document
 * scanner) can plug in later by registering a `TextRecognition` module with the
 * same functions; until then `isSupported()` is false and photo import stays
 * hidden.
 *
 * Implementations must recognize on the device and never upload images.
 */

/** One recognized line, with a normalized (0...1), top-left-origin box. */
export interface RecognizedLine {
  text: string
  confidence: number
  x: number
  y: number
  width: number
  height: number
}

export interface RecognizedPage {
  lines: RecognizedLine[]
}

export interface RecognizeOptions {
  /** BCP-47 languages to favor, app language first. */
  languages: string[]
}

interface TextRecognitionNative {
  textRecognitionVersion?: number
  isDocumentScannerSupported(): boolean
  recognizeImage(
    uri: string,
    options: RecognizeOptions
  ): Promise<RecognizedPage>
  scanDocument(
    options: RecognizeOptions
  ): Promise<{ pages: RecognizedPage[] } | null>
}

const native =
  requireOptionalNativeModule<TextRecognitionNative>('TextRecognition')

/** Whether this binary ships the module (false on Android and older builds). */
export function isSupported(): boolean {
  return !!native?.textRecognitionVersion
}

/** The document camera needs a real camera; simulators report false. */
export function isDocumentScannerSupported(): boolean {
  return !!native && native.isDocumentScannerSupported()
}

/** Reads a local image file (`file://`). The file is not modified. */
export function recognizeImage(
  uri: string,
  options: RecognizeOptions
): Promise<RecognizedPage> {
  if (!native) return Promise.reject(new Error('unsupported'))
  return native.recognizeImage(uri, options)
}

/**
 * Opens the document camera and recognizes every captured page in memory.
 * Resolves null when the user cancels.
 */
export async function scanDocument(
  options: RecognizeOptions
): Promise<RecognizedPage[] | null> {
  if (!native) throw new Error('unsupported')
  const result = await native.scanDocument(options)
  return result?.pages ?? null
}
