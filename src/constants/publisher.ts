export const publishers = [
  'publisher',
  'regularAuxiliary',
  'regularPioneer',
  'circuitOverseer',
  'specialPioneer',
  'custom',
] as const

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

/**
 * Per-Publisher i18n keys for the **Tenure Start Date** UI surfaces (settings
 * row, onboarding prompt, profile detail badge). The label set is role-shaped
 * (not Tenure-Type-shaped) because the glossary's display rule is per-role:
 *
 * - "regular pioneer since…"
 * - "special pioneer since…"
 * - "circuit overseer (full-time service) since…" ← parenthetical disambiguation
 *   per glossary spec; CO is technically Full-Time Service but isn't called a
 *   "pioneer" in JW vernacular.
 * - "auxiliary pioneer since…"
 *
 * The i18n key namespace is kept as `*StartDate` (not `*TenureStart`) for
 * persisted-key stability — the strings change but the keys stay greppable.
 */
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
