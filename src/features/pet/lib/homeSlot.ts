/** What Home's `pet` slot shows. */
export type PetHomeSlot = 'prompt' | 'section' | null

/**
 * The opt-in prompt until a companion exists (unless the User said Not now),
 * then the pet's card. A hidden section (`homeScreenElements.pet === false`)
 * shows neither.
 */
export function petHomeSlot({
  hasPet,
  promptDismissed,
  visible,
}: {
  hasPet: boolean
  promptDismissed: boolean
  visible: boolean
}): PetHomeSlot {
  if (!visible) return null
  if (hasPet) return 'section'
  return promptDismissed ? null : 'prompt'
}
