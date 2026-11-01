let listener: (() => void) | null = null

export function setDevRemountListener(fn: (() => void) | null): void {
  listener = fn
}

export function triggerDevRemount(): void {
  listener?.()
}
