/**
 * The bottom bar (and tablet sidebar) destinations the user can reorder. None
 * can be hidden; Progress only shows for roles that log hours, but keeps its
 * saved position so switching roles restores it. Tools and Settings stay pinned
 * after these.
 */
export type TabOrderKey = 'Home' | 'Schedule' | 'Contacts' | 'Progress'

export const DEFAULT_TAB_ORDER: TabOrderKey[] = [
  'Home',
  'Schedule',
  'Contacts',
  'Progress',
]

/** Drops unknown keys and appends any missing ones in default order. */
export function getEffectiveTabOrder(
  stored: string[] | undefined
): TabOrderKey[] {
  return [...new Set([...(stored ?? []), ...DEFAULT_TAB_ORDER])].filter(
    (key): key is TabOrderKey => DEFAULT_TAB_ORDER.includes(key as TabOrderKey)
  )
}

/**
 * Moves the tab at `from` to `to`, both positions among `visible`, and returns
 * the full order. Tabs missing from `visible` keep their saved positions.
 */
export function moveVisibleTab(
  order: TabOrderKey[],
  visible: TabOrderKey[],
  from: number,
  to: number
): TabOrderKey[] {
  const key = visible[from]
  const anchor = visible[to]
  if (!key || !anchor || key === anchor) return order
  const next = order.filter((k) => k !== key)
  const anchorIdx = next.indexOf(anchor)
  if (anchorIdx < 0) return order
  next.splice(to < from ? anchorIdx : anchorIdx + 1, 0, key)
  return next
}
