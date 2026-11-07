import { downloadFileName } from '@/lib/files/fileNames'

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function buildFileBlob(
  data: { text: string } | { base64: string },
  mimeType: string
): Blob {
  const part = 'base64' in data ? base64ToBytes(data.base64) : data.text
  return new Blob([part], { type: mimeType })
}

const REVOKE_AFTER_MS = 60_000

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = downloadFileName(fileName)
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}
