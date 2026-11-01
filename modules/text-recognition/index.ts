import { requireOptionalNativeModule } from 'expo-modules-core'

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

export function isSupported(): boolean {
  return !!native?.textRecognitionVersion
}

export function isDocumentScannerSupported(): boolean {
  return !!native && native.isDocumentScannerSupported()
}

export function recognizeImage(
  uri: string,
  options: RecognizeOptions
): Promise<RecognizedPage> {
  if (!native) return Promise.reject(new Error('unsupported'))
  return native.recognizeImage(uri, options)
}

export async function scanDocument(
  options: RecognizeOptions
): Promise<RecognizedPage[] | null> {
  if (!native) throw new Error('unsupported')
  const result = await native.scanDocument(options)
  return result?.pages ?? null
}
