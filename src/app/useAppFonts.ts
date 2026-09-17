import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import { Kalam_400Regular, Kalam_700Bold } from '@expo-google-fonts/kalam'

// CJK handwriting fonts are downloaded on demand by service-reports/lib/handwritingFont.
export function useAppFonts() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
    Kalam_400Regular,
    Kalam_700Bold,
  })
  return fontsLoaded
}
