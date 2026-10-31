import { downloadFileName } from '@/lib/files/fileNames'

/** Bytes of a base64 string; throws on malformed input. */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** A Blob of a file's text or base64 bytes, typed `mimeType`. */
export function buildFileBlob(
  data: { text: string } | { base64: string },
  mimeType: string
): Blob {
  const part = 'base64' in data ? base64ToBytes(data.base64) : data.text
  return new Blob([part], { type: mimeType })
}

/** How long a download's object URL lives; the browser has taken it by then. */
const REVOKE_AFTER_MS = 60_000

/**
 * Downloads `blob` as `fileName` through a temporary link, the way every
 * browser saves a generated file. The link is attached to the page first:
 * Safari and Firefox ignore a click on a detached one.
 */
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
