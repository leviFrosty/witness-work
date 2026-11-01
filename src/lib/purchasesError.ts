type RevenueCatErrorLike = {
  code?: unknown
  message?: unknown
  stack?: unknown
  readableErrorCode?: unknown
  userInfo?: { readableErrorCode?: unknown } | null
}

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
