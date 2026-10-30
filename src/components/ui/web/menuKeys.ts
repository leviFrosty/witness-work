/**
 * The item a menu's arrow keys move to from `current` among `count` items
 * (wrapping), or `null` for a key that doesn't move.
 */
export function nextMenuIndex(
  key: string,
  current: number,
  count: number
): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * The item a typed character jumps to: the next label after `current` that
 * starts with it (wrapping), or `null` when none does or `key` isn't a
 * character.
 */
export function typeaheadIndex(
  labels: string[],
  current: number,
  key: string
): number | null {
  if (key.length !== 1 || key.trim() === '') return null
  const wanted = key.toLocaleLowerCase()
  for (let step = 1; step <= labels.length; step++) {
    const index = (current + step + labels.length) % labels.length
    if (labels[index]!.toLocaleLowerCase().startsWith(wanted)) return index
  }
  return null
}
