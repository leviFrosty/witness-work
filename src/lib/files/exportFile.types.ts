/**
 * A file the app hands to the User: a backup, a CSV, a contact, a picture.
 * Native writes it to the cache folder and opens the share sheet; the web
 * downloads it (ADR 0037 §8).
 */
export type ExportFile = {
  fileName: string
  mimeType: string
  /** IOS's type identifier for the share sheet. */
  uti?: string
  dialogTitle?: string
  /**
   * `save` is a file for the User to keep (a backup, a CSV): the web downloads
   * it. `send` is one for another app (a contact, a picture): on a phone the
   * web opens the share sheet when the browser can share files, and downloads
   * otherwise. Native opens the share sheet for both.
   */
  purpose: 'save' | 'send'
} & ({ text: string } | { base64: string })
