import { useNavigation } from '@react-navigation/native'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { PetSpeciesId } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import PetCardHeader from '@/features/pet/components/PetCardHeader'
import usePetHomeScene from '@/features/pet/hooks/usePetHomeScene'
import useSharePet from '@/features/pet/hooks/useSharePet'
import PetSceneView from '@/features/pet/render/PetSceneView'

/**
 * Home's Pet Companion card: the pet's name and hearts above its room. Tap the
 * pet to pat it (or wake it), drag across it to rub. Long-press the header to
 * rename it, change it, decorate its room or share a picture of it. Renders
 * nothing without a companion.
 */
export default function PetHomeSection({
  visitor,
}: {
  /** A buddy's pet visiting today, sitting beside the companion. */
  visitor?: { species: PetSpeciesId; coat: string; name?: string } | null
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const scene = usePetHomeScene(visitor)
  const share = useSharePet()
  if (!scene) return null
  const { life, name } = scene
  const sleeping = life.dead || life.asleep

  return (
    <Card style={{ gap: 12, paddingVertical: 16, paddingHorizontal: 16 }}>
      <HomeSectionMenu
        section='pet'
        accessibilityLabel={name}
        actions={[
          {
            id: 'pet_rename',
            title: i18n.t('pet.menu.rename'),
            systemImage: 'pencil',
            onPress: () => navigation.navigate('PetRename'),
          },
          {
            id: 'pet_change',
            title: i18n.t('pet.menu.change'),
            systemImage: 'pawprint',
            onPress: () => navigation.navigate('PetPicker', { mode: 'change' }),
          },
          {
            id: 'pet_decorate',
            title: i18n.t('pet.menu.decorate'),
            systemImage: 'paintbrush',
            onPress: () => navigation.navigate('PetRoom'),
          },
          {
            id: 'pet_share',
            title: i18n.t('pet.menu.share'),
            systemImage: 'square.and.arrow.up',
            onPress: () => void share(scene.input, name),
          },
        ]}
      >
        <PetCardHeader name={name} life={life} />
      </HomeSectionMenu>
      <PetSceneView
        ref={scene.sceneRef}
        input={scene.input}
        pauseOffScreen
        borderRadius={theme.numbers.borderRadiusMd}
        accessibilityLabel={i18n.t('pet.a11y.scene', { name })}
        accessibilityHint={i18n.t(
          sleeping ? 'pet.a11y.wakeHint' : 'pet.a11y.patHint'
        )}
        onPat={scene.onPat}
        onTrick={scene.onTrick}
        onWakeRequest={scene.wake}
        onGiftTap={scene.collectGift}
      />
      {life.dead && (
        <ActionButton onPress={scene.wake}>
          {i18n.t('pet.wakeButton', { name })}
        </ActionButton>
      )}
    </Card>
  )
}
