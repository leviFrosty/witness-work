export type TransferLike = {
  files?: ArrayLike<File> | null
  getData?: (type: string) => string
}

export type PastedImage = { uri: string; size: number }

export const MAX_PASTED_IMAGES = 10

const hasText = (html: string): boolean => {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  return (
    body
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .trim().length > 0
  )
}

export function pastedImageFiles(transfer: TransferLike | null): File[] {
  if (!transfer?.files?.length) return []
  const files = Array.from(transfer.files)
  if (!files.every((file) => file.type.startsWith('image/'))) return []

  let html = ''
  try {
    html = transfer.getData?.('text/html') ?? ''
  } catch {}
  return hasText(html) ? [] : files
}

export const transferHasFiles = (transfer: TransferLike | null): boolean =>
  !!transfer?.files?.length
