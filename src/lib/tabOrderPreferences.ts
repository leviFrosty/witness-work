export type TabOrderKey =
  | 'Home'
  | 'Contacts'
  | 'Progress'
  | 'Schedule'
  | 'Territories'

export const DEFAULT_TAB_ORDER: TabOrderKey[] = [
  'Home',
  'Contacts',
  'Progress',
  'Schedule',
  'Territories',
]

export type TabAvailability = {
  showsYearTabs: boolean
  territories: boolean
}

export function isTabAvailable(
  key: TabOrderKey,
  { showsYearTabs, territories }: TabAvailability
): boolean {
  if (key === 'Progress') return showsYearTabs
  if (key === 'Territories') return territories
  return true
}

export function getEffectiveTabOrder(
  stored: string[] | undefined
): TabOrderKey[] {
  return [...new Set([...(stored ?? []), ...DEFAULT_TAB_ORDER])].filter(
    (key): key is TabOrderKey => DEFAULT_TAB_ORDER.includes(key as TabOrderKey)
  )
}
