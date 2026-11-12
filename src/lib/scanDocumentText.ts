import * as ImagePicker from 'expo-image-picker'
import * as TextRecognition from '../../modules/text-recognition'
import { appLanguage } from '@/lib/numbers'
import { hasCapability } from '@/lib/platformCapabilities'
import { layoutRecognizedPages } from '@/lib/recognizedTextLayout'

export type DocumentTextScan =
  | { status: 'scanned'; text: string; pages: number }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'unsupported' }

type ScanOverride = () => Promise<DocumentTextScan>

let override: ScanOverride | null = null

export function setDocumentScanOverride(next: ScanOverride | null): void {
  if (!__DEV__) return
  override = next
}

export const canScanDocumentText = (): boolean =>
  override !== null ||
  (hasCapability('camera') && TextRecognition.isDocumentScannerSupported())

const recognitionLanguage = () => appLanguage().replace(/_/g, '-')

async function cameraAllowed(): Promise<boolean> {
  let permission = await ImagePicker.getCameraPermissionsAsync()
  if (!permission.granted && permission.canAskAgain)
    permission = await ImagePicker.requestCameraPermissionsAsync()
  return permission.granted
}

export async function scanDocumentText(): Promise<DocumentTextScan> {
  if (override) return override()
  if (!canScanDocumentText()) return { status: 'unsupported' }
  if (!(await cameraAllowed())) return { status: 'denied' }
  const pages = await TextRecognition.scanDocument({
    languages: [recognitionLanguage()],
  })
  if (!pages) return { status: 'cancelled' }
  return {
    status: 'scanned',
    text: layoutRecognizedPages(pages).trim(),
    pages: pages.length,
  }
}
