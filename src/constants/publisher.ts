export const publishers = [
  'publisher',
  'regularAuxiliary',
  'regularPioneer',
  'circuitOverseer',
  'specialPioneer',
  'custom',
] as const

const PIONEER_PUBLISHERS = [
  'regularPioneer',
  'specialPioneer',
  'circuitOverseer',
] as const

export const isPioneer = (publisher: (typeof publishers)[number]): boolean =>
  PIONEER_PUBLISHERS.includes(publisher as never)
