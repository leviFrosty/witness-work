const FOCUS_GRACE_MS = 1500

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
