export type TabOrderKey = 'Home' | 'Contacts' | 'Progress' | 'Schedule'

export const DEFAULT_TAB_ORDER: TabOrderKey[] = [
  'Home',
  'Contacts',
  'Progress',
  'Schedule',
]

export function getEffectiveTabOrder(
  stored: string[] | undefined
): TabOrderKey[] {
  return [...new Set([...(stored ?? []), ...DEFAULT_TAB_ORDER])].filter(
    (key): key is TabOrderKey => DEFAULT_TAB_ORDER.includes(key as TabOrderKey)
  )
}

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
