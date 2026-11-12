export type ShareScopeMode = 'whole' | 'streets'

export type ShareSelection = {
  whole: boolean
  chosen: string[]
  streetIds: string[] | undefined
  nothingPicked: boolean
}

export const shareSelection = ({
  mode,
  picked,
  available,
  owner,
}: {
  mode: ShareScopeMode
  picked: readonly string[]
  available: readonly string[]
  owner: boolean
}): ShareSelection => {
  const chosen =
    mode === 'whole'
      ? [...available]
      : picked.filter((id) => available.includes(id))
  const whole =
    owner &&
    (mode === 'whole' ||
      (available.length > 0 && chosen.length === available.length))
  return {
    whole,
    chosen,
    streetIds: whole ? undefined : chosen,
    nothingPicked: !whole && chosen.length === 0,
  }
}

export const wholeMarked = (
  mode: ShareScopeMode,
  canPickWhole: boolean
): boolean => canPickWhole && mode === 'whole'
