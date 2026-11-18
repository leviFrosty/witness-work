const DATE_TAG = '$reloadDate'

function keepDates(this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key]
  return raw instanceof Date ? { [DATE_TAG]: raw.getTime() } : value
}

function reviveDates(_key: string, value: unknown) {
  if (value === null || typeof value !== 'object' || !(DATE_TAG in value))
    return value
  const time = (value as Record<string, unknown>)[DATE_TAG]
  return new Date(typeof time === 'number' ? time : NaN)
}

export function encodeDraft(value: unknown): string {
  return JSON.stringify({ value }, keepDates)
}

export function decodeDraft<T>(raw: string): { value: T } | undefined {
  try {
    const parsed: unknown = JSON.parse(raw, reviveDates)
    return parsed !== null && typeof parsed === 'object' && 'value' in parsed
      ? (parsed as { value: T })
      : undefined
  } catch {
    return undefined
  }
}
