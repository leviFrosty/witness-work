import i18n from '@/lib/locales'
import { downloadBlob } from '@/lib/files/download'

function recoveryKeyDocument(): { title: string; body: string } {
  return {
    title: i18n.t('webSignUp_fileName'),
    body: i18n.t('webSignUp_fileBody'),
  }
}

export function downloadRecoveryKey(recoveryKey: string): void {
  const { title, body } = recoveryKeyDocument()
  const text = `${title}\n\n${recoveryKey}\n\n${body}\n`
  downloadBlob(
    new Blob([text], { type: 'text/plain;charset=utf-8' }),
    `${title}.txt`
  )
}

const PRINT_ID = 'ww-recovery-key-print'

const PRINT_KEEP_MS = 60_000

let clearPrint: (() => void) | null = null

export function clearPrintedRecoveryKey(): void {
  clearPrint?.()
  document.getElementById(PRINT_ID)?.remove()
}

export function printRecoveryKey(recoveryKey: string): void {
  clearPrintedRecoveryKey()
  const { title, body } = recoveryKeyDocument()
  const sheet = document.createElement('div')
  sheet.id = PRINT_ID
  sheet.setAttribute('aria-hidden', 'true')
  const style = document.createElement('style')
  style.textContent = [
    `@media screen { #${PRINT_ID} { display: none; } }`,
    `@media print {`,
    `  body > *:not(#${PRINT_ID}) { display: none !important; }`,
    `  #${PRINT_ID} { font-family: system-ui, sans-serif; color: #000; padding: 24px; }`,
    `  #${PRINT_ID} h1 { font-size: 20px; margin: 0 0 16px; }`,
    `  #${PRINT_ID} p.key { font-family: ui-monospace, Menlo, monospace; font-size: 18px; letter-spacing: 1px; margin: 0 0 16px; word-break: break-all; }`,
    `}`,
  ].join('\n')
  const heading = document.createElement('h1')
  heading.textContent = title
  const key = document.createElement('p')
  key.className = 'key'
  key.textContent = recoveryKey
  const note = document.createElement('p')
  note.textContent = body
  sheet.append(style, heading, key, note)
  document.body.appendChild(sheet)

  let open = false
  const began = () => (open = true)
  const remove = () => {
    clearTimeout(timer)
    window.removeEventListener('beforeprint', began)
    window.removeEventListener('afterprint', remove)
    sheet.remove()
    if (clearPrint === remove) clearPrint = null
  }
  const timer = setTimeout(remove, PRINT_KEEP_MS)
  clearPrint = remove
  window.addEventListener('beforeprint', began)
  window.addEventListener('afterprint', remove)
  try {
    window.print()
  } finally {
    if (!open) remove()
  }
}
