export const countTruthyValueStrings = (obj: Record<string, unknown>) => {
  const values = Object.values(obj)

  const truthyStrings = values.filter(
    (value) => typeof value === 'string' && value.trim() !== ''
  )

  return truthyStrings.length
}
