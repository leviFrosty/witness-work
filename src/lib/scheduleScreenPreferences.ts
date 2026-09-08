export type ScheduleScreenElementKey = 'assistant'
export const DEFAULT_SCHEDULE_SCREEN_ELEMENTS_ORDER: ScheduleScreenElementKey[] =
  ['assistant']

export function getEffectiveScheduleScreenOrder(
  stored: string[] | undefined
): ScheduleScreenElementKey[] {
  return [
    ...new Set([...(stored ?? []), ...DEFAULT_SCHEDULE_SCREEN_ELEMENTS_ORDER]),
  ].filter((key): key is ScheduleScreenElementKey =>
    DEFAULT_SCHEDULE_SCREEN_ELEMENTS_ORDER.includes(
      key as ScheduleScreenElementKey
    )
  )
}
