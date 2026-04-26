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

export const tracksStartDate = (
  publisher: (typeof publishers)[number]
): boolean => isPioneer(publisher) || publisher === 'regularAuxiliary'

type StartDateRole =
  | 'pioneer'
  | 'specialPioneer'
  | 'circuitOverseer'
  | 'regularAuxiliary'

type StartDateLabels = {
  label: `${StartDateRole}StartDate`
  description: `${StartDateRole}StartDate_description`
  title: `${StartDateRole}StartDateTitle`
  badge: `profileStat${Capitalize<StartDateRole>}`
}

export const getStartDateLabels = (
  publisher: (typeof publishers)[number]
): StartDateLabels => {
  switch (publisher) {
    case 'specialPioneer':
      return {
        label: 'specialPioneerStartDate',
        description: 'specialPioneerStartDate_description',
        title: 'specialPioneerStartDateTitle',
        badge: 'profileStatSpecialPioneer',
      }
    case 'circuitOverseer':
      return {
        label: 'circuitOverseerStartDate',
        description: 'circuitOverseerStartDate_description',
        title: 'circuitOverseerStartDateTitle',
        badge: 'profileStatCircuitOverseer',
      }
    case 'regularAuxiliary':
      return {
        label: 'regularAuxiliaryStartDate',
        description: 'regularAuxiliaryStartDate_description',
        title: 'regularAuxiliaryStartDateTitle',
        badge: 'profileStatRegularAuxiliary',
      }
    default:
      return {
        label: 'pioneerStartDate',
        description: 'pioneerStartDate_description',
        title: 'pioneerStartDateTitle',
        badge: 'profileStatPioneer',
      }
  }
}
