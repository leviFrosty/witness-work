const CORE_DATA_EPOCH_OFFSET_SECONDS = 978307200

export const coreDataRefToDate = (zdate: number): Date =>
  new Date((zdate + CORE_DATA_EPOCH_OFFSET_SECONDS) * 1000)

export const coreDataRefToDateOrNull = (
  zdate: number | null | undefined
): Date | null =>
  zdate === null || zdate === undefined ? null : coreDataRefToDate(zdate)
