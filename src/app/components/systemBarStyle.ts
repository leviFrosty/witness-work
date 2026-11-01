export function systemBarStyle(
  chosen: 'light' | 'dark' | undefined,
  system: string | null | undefined
): 'light' | 'dark' {
  return (chosen ?? system) === 'dark' ? 'light' : 'dark'
}
