let depth = 0
export const isApplyingRemoteData = () => depth > 0

export function withRemoteDataMutation<T>(apply: () => T): T {
  depth++
  try {
    return apply()
  } finally {
    depth--
  }
}
