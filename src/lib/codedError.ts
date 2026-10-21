/**
 * Expo's code for a native module failure (`ERR_SQLITE_ERROR`,
 * `ERR_NOTIFICATIONS_FAILED_TO_SCHEDULE`), or a module's own `E_…` code.
 */
const NATIVE_CODE = /^E(?:RR)?_[A-Z0-9_]+$/

/**
 * A native module failure, reported as an `Error` named after its code. Promise
 * rejections from native code reach JavaScript as a plain `Error` with no stack
 * frames, so error tracking grouped every one of them, whatever the module,
 * into one issue by the type `Error` alone.
 */
export class CodedError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = code
    this.code = code
  }
}

/**
 * Wraps a generic `Error` that carries a native module code in a `CodedError`;
 * anything else, including errors already named for their type, comes back
 * unchanged.
 */
export function toCodedError(error: unknown): unknown {
  if (!(error instanceof Error) || error instanceof CodedError) return error
  if (error.name !== 'Error') return error
  const code = (error as { code?: unknown }).code
  if (typeof code !== 'string' || !NATIVE_CODE.test(code)) return error
  const wrapped = new CodedError(code, error.message)
  if (typeof error.stack === 'string') wrapped.stack = error.stack
  return wrapped
}
