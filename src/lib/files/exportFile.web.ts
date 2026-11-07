import { buildFileBlob, downloadBlob } from '@/lib/files/download'
import type { ExportFile } from '@/lib/files/exportFile.types'
import { downloadFileName } from '@/lib/files/fileNames'

export type { ExportFile } from '@/lib/files/exportFile.types'

export type PreparedExport = { blob: Blob; file: ExportFile }

export const canExportFiles = (): Promise<boolean> => Promise.resolve(true)

export async function prepareExport(file: ExportFile): Promise<PreparedExport> {
  return {
    blob: buildFileBlob(file, file.mimeType),
    file: { ...file, fileName: downloadFileName(file.fileName) },
  }
}

const isTouchDevice = () =>
  typeof matchMedia === 'function' &&
  matchMedia('(pointer: coarse)').matches &&
  matchMedia('(hover: none)').matches

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
