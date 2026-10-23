/**
 * The PostScript name SwiftUI looks a theme font up by (`Inter_600SemiBold` →
 * `Inter-SemiBold`); expo-font's `Inter_600SemiBold` style aliases only exist
 * for React Native text.
 */
export const postScriptName = (family: string) =>
  family.replace(/^Inter_\d+/, 'Inter-')
