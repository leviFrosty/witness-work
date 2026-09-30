/** Same legacy label on two devices must migrate to the same identity. */
export function legacyDefinitionId(
  kind: 'category' | 'field',
  label: string
): string {
  return `legacy-${kind}-${encodeURIComponent(label.trim()).replace(/\./g, '%2E')}`
}
