export type ExportFile = {
  fileName: string
  mimeType: string

  uti?: string
  dialogTitle?: string

  purpose: 'save' | 'send'
} & ({ text: string } | { base64: string })
