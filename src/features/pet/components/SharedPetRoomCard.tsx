import { View } from 'react-native'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { SharedPet } from '@/types/pet'
import usePetWindow from '@/features/pet/hooks/usePetWindow'
import { petDisplayName } from '@/features/pet/lib/names'
import {
  sharedRoomInput,
  sharedRoomWindow,
} from '@/features/pet/lib/sharedRoom'
import PetSceneView from '@/features/pet/render/PetSceneView'

const PAD = 16

export default function SharedPetRoomCard({
  pet,
  ownerName,
  seedKey,
}: {
  pet: SharedPet
  ownerName: string

  seedKey: string
}) {
  const theme = useTheme()
  const window = usePetWindow(sharedRoomWindow(pet))
  const name = petDisplayName(pet)
  const owner = i18n.t('pet.buddyRoom.owner', { name: ownerName })

  return (
    <Card style={{ gap: 0, paddingVertical: 0, paddingHorizontal: 0 }}>
      <View
        accessible
        accessibilityRole='header'
        accessibilityLabel={`${name}, ${owner}`}
        style={{
          gap: 2,
          paddingTop: PAD + 2,
          paddingBottom: PAD - 4,
          paddingHorizontal: PAD + 4,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {name}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {owner}
        </Text>
      </View>
      <PetSceneView
        input={sharedRoomInput(pet, window, seedKey)}
        pauseOffScreen
        touchInset={PAD}
        borderRadius={theme.numbers.borderRadiusMd}
        accessibilityLabel={i18n.t('pet.a11y.scene', { name })}
        accessibilityHint={i18n.t('pet.a11y.patHint')}
      />
    </Card>
  )
}
