import { useRef } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import WholeWordsText from '@/components/ui/WholeWordsText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { defaultCoatFor, PET_SPECIES_IDS, type PetSpecies } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import { speciesName } from '@/features/pet/lib/names'
import PetSpriteTile from '@/features/pet/render/PetSpriteTile'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import useOnScreen from '@/hooks/useOnScreen'
import useSceneActive from '@/features/pet/render/useSceneActive'

export default function PetPromptCard() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  const largeText = useAccessibilityTextSize()

  const animalsRef = useRef<View>(null)
  const onScreen = useOnScreen(animalsRef, useSceneActive())

  const choose = (species?: PetSpecies) => {
    analytics.capture('pet_prompt_answered', {
      choice: 'choose',
      ...(species ? { species } : {}),
    })
    navigation.navigate('PetPicker', { mode: 'adopt', species })
  }
  const notNow = () => {
    analytics.capture('pet_prompt_answered', { choice: 'not_now' })
    usePreferences.getState().set({ petPromptDismissed: true })
  }

  const buttonStyle = {
    flex: largeText ? undefined : 1,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.numbers.borderRadiusMd,
  }

  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 2 }}>
        <WholeWordsText
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('pet.promptTitle')}
        </WholeWordsText>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('pet.promptDescription')}
        </Text>
      </View>
      <View
        ref={animalsRef}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 4,
        }}
      >
        {PET_SPECIES_IDS.map((species, i) => (
          <Button
            key={species}
            accessibilityRole='button'
            accessibilityLabel={speciesName(species)}
            accessibilityHint={i18n.t('pet.a11y.promptAnimalHint')}
            onPress={() => choose(species)}
            style={{
              padding: 4,
              borderRadius: theme.numbers.borderRadiusMd,
              backgroundColor: theme.colors.backgroundLighter,
            }}
          >
            <PetSpriteTile
              species={species}
              coat={defaultCoatFor(species)}
              size={44}
              seed={i * 900}
              paused={!onScreen}
            />
          </Button>
        ))}
      </View>
      <View style={{ flexDirection: largeText ? 'column' : 'row', gap: 10 }}>
        <Button
          accessibilityRole='button'
          onPress={notNow}
          style={{
            ...buttonStyle,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('pet.promptNotNow')}
          </Text>
        </Button>
        <Button
          accessibilityRole='button'
          onPress={() => choose()}
          style={{ ...buttonStyle, backgroundColor: theme.colors.accent }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textInverse,
            }}
          >
            {i18n.t('pet.promptChoose')}
          </Text>
        </Button>
      </View>
    </Card>
  )
}
