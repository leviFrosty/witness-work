/**
 * RevenueCat rejects with its own shape: a numeric string `code` and a readable
 * name for it. iOS sets the name at the top level and in `userInfo`; Android's
 * bridge sets only `userInfo.readableErrorCode`.
 */
type RevenueCatErrorLike = {
  code?: unknown
  message?: unknown
  stack?: unknown
  readableErrorCode?: unknown
  userInfo?: { readableErrorCode?: unknown } | null
}

/**
 * A RevenueCat error, reported as an `Error` named after its code
 * (`PurchasesError:STORE_PROBLEM_ERROR`). RevenueCat's own errors carry no
 * stack that tells them apart, so error tracking put every kind in one issue.
 * `background` marks a read the user didn't start (customer info, offerings,
 * identifying), where store states aren't reported; see
 * `isBackgroundStoreStateError`.
 */
export class PurchasesError extends Error {
  readonly code: string
  readonly readableErrorCode: string
  readonly background: boolean

  constructor(
    code: string,
    readableErrorCode: string,
    message: string,
    background: boolean
  ) {
    super(message)
    this.name = `PurchasesError:${readableErrorCode}`
    this.code = code
    this.readableErrorCode = readableErrorCode
    this.background = background
  }
}

/**
 * Wraps a RevenueCat error in a `PurchasesError`; anything else comes back
 * unchanged. Pass `background` for a read the user didn't start.
 */
export function toPurchasesError(
  error: unknown,
  { background = false }: { background?: boolean } = {}
): unknown {
  if (error instanceof PurchasesError) return error
  if (error === null || typeof error !== 'object') return error
  const e = error as RevenueCatErrorLike
  const readable =
    typeof e.userInfo?.readableErrorCode === 'string'
      ? e.userInfo.readableErrorCode
      : e.readableErrorCode
  if (typeof e.code !== 'string' || typeof readable !== 'string') return error
  const wrapped = new PurchasesError(
    e.code,
    readable,
    typeof e.message === 'string' ? e.message : readable,
    background
  )
  if (typeof e.stack === 'string') wrapped.stack = e.stack
  return wrapped
}
