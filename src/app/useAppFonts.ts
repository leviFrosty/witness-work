import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'

// Tamagui's config names its faces `Inter` and `InterBold`; they're the same
// Medium and Bold files the app already loads, registered under those names
// too. Kalam loads with the Service Report (service-reports/lib/handwritingFont),
// and CJK handwriting fonts download on demand there.
export function useAppFonts() {
  const [fontsLoaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter: Inter_500Medium,
    InterBold: Inter_700Bold,
  })
  // A font that fails to load falls back to the system font; the splash must
  // still go away.
  return fontsLoaded || !!error
}
