const NATIVE_CODE = /^E(?:RR)?_[A-Z0-9_]+$/

export class CodedError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = code
    this.code = code
  }
}

export function toCodedError(error: unknown): unknown {
  if (!(error instanceof Error) || error instanceof CodedError) return error
  if (error.name !== 'Error') return error
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string' || !NATIVE_CODE.test(code)) return error
  const wrapped = new CodedError(code, error.message)
  if (typeof error.stack === 'string') wrapped.stack = error.stack
  return wrapped
}
