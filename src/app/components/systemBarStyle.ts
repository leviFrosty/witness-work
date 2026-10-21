/** Light icons on a dark app, dark icons on a light one. */
export function systemBarStyle(
  chosen: 'light' | 'dark' | undefined,
  system: string | null | undefined
): 'light' | 'dark' {
  return (chosen ?? system) === 'dark' ? 'light' : 'dark'
}
