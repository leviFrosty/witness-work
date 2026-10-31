import { buildFileBlob, downloadBlob } from '@/lib/files/download'
import type { ExportFile } from '@/lib/files/exportFile.types'
import { downloadFileName } from '@/lib/files/fileNames'

export type { ExportFile } from '@/lib/files/exportFile.types'

/** A file built and ready to hand to the User. */
export type PreparedExport = { blob: Blob; file: ExportFile }

/** The web always can: a download needs no sharing support. */
export const canExportFiles = (): Promise<boolean> => Promise.resolve(true)

/** Builds the file's Blob. */
export async function prepareExport(file: ExportFile): Promise<PreparedExport> {
  return {
    blob: buildFileBlob(file, file.mimeType),
    file: { ...file, fileName: downloadFileName(file.fileName) },
  }
}

/** Phones and tablets: where a share sheet is how people send a file on. */
const isTouchDevice = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  matchMedia('(hover: none)').matches

/**
 * Hands the file to the share sheet when `file` is for another app, the device
 * is a phone or tablet, and the browser can share this file; downloads it
 * otherwise. A share the browser refuses (the tap's permission has lapsed, or
 * it can't share this type) falls back to the download; the User closing the
 * sheet doesn't.
 */
export async function deliverExport({
  blob,
  file,
}: PreparedExport): Promise<void> {
  if (file.purpose === 'send' && isTouchDevice() && navigator.canShare) {
    const shareable = new File([blob], file.fileName, { type: file.mimeType })
    if (navigator.canShare({ files: [shareable] })) {
      try {
        await navigator.share({ files: [shareable], title: file.dialogTitle })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
  }
  downloadBlob(blob, file.fileName)
}
