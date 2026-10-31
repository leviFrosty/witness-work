/** How long a file may take to arrive after the page regains focus. */
const FOCUS_GRACE_MS = 1500

/**
 * Opens the browser's file chooser and resolves with the files picked; an empty
 * list when it's closed without one. `capture` asks a phone for its camera
 * (`environment` is the back one); desktop browsers ignore it.
 *
 * The input is attached to the page for the click, as Safari needs, and removed
 * once the chooser settles. Must run inside a tap or click.
 */
export function pickFiles(options: {
  accept?: string
  multiple?: boolean
  capture?: 'environment' | 'user'
}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (options.accept) input.accept = options.accept
    if (options.multiple) input.multiple = true
    if (options.capture) input.setAttribute('capture', options.capture)
    input.style.display = 'none'
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus)
      const files = Array.from(input.files ?? [])
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', settle)
    input.addEventListener('cancel', settle)
    // Safari before 16.4 and some in-app browsers never send `cancel`. The page
    // regains focus when the chooser closes; if no file arrived a moment later,
    // it was closed without one.
    const onFocus = () => {
      window.removeEventListener('focus', onFocus)
      setTimeout(() => {
        if (!input.files?.length) settle()
      }, FOCUS_GRACE_MS)
    }
    window.addEventListener('focus', onFocus)
    document.body.appendChild(input)
    input.click()
  })
}
