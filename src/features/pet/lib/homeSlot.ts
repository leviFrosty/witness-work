export type PetHomeSlot = 'prompt' | 'section' | null

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
