import { useEffect } from 'react'
import { Platform, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { isHomeSectionShown, setHomeSectionShown } from '@/lib/homeSections'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import type { RootStackParamList } from '@/types/rootStack'
import PetBuddyVisitsSection from '@/app/pet/PetBuddyVisitsSection'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import PetSheetClose from '@/features/pet/components/PetSheetClose'
import usePetSheetInsets from '@/features/pet/hooks/usePetSheetInsets'

type Props = NativeStackScreenProps<RootStackParamList, 'PetSettings'>

/**
 * The pet's settings, from its details: whether its card shows on Home, and
 * (with Buddies) whether buddies' pets visit, for everyone and per buddy.
 */
export default function PetSettingsScreen({ navigation }: Props) {
  const theme = useTheme()
  const sheetInsets = usePetSheetInsets()
  const buddiesEnabled = useBuddiesEnabled()
  const homeScreenElements = usePreferences((s) => s.homeScreenElements)
  const petPromptDismissed = usePreferences((s) => s.petPromptDismissed)
  const hasPet = usePet((s) => s.pet !== null)
  const sheetColor = theme.colors.sheet
  useEffect(() => {
    navigation.setOptions({ contentStyle: { backgroundColor: sheetColor } })
  }, [navigation, sheetColor])

  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: sheetInsets.top,
        paddingBottom: sheetInsets.bottom,
        gap: 18,
        backgroundColor: theme.colors.sheet,
        // iOS sizes the sheet to this content; Android shows it full screen.
        flex: Platform.OS === 'android' ? 1 : undefined,
      }}
    >
      <Text
        accessibilityRole='header'
        style={{ fontSize: theme.fontSize('xl'), fontFamily: theme.fonts.bold }}
      >
        {i18n.t('pet.settings.title')}
      </Text>
      <Section>
        <InputRowSwitch
          label={i18n.t('pet.settings.showOnHome')}
          value={isHomeSectionShown('pet', {
            homeScreenElements,
            petPromptDismissed,
            hasPet,
          })}
          onValueChange={(shown) => setHomeSectionShown('pet', shown)}
          lastInSection
        />
      </Section>
      {buddiesEnabled && <PetBuddyVisitsSection />}
      <PetSheetClose />
    </View>
  )
}
