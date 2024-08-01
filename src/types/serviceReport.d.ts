export type ServiceReport = {
  id: string
  hours: number
  minutes: number
  date: Date
  ldc?: boolean
  /** User input tag, solely for the purpose of displaying on the UI. */
  tag?: string
  /** Used to denote the current tag is credit time, similar to LDC. */
  credit?: boolean
}
