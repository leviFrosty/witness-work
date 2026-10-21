import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { PetSpeciesId } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import PetCardHeader from '@/features/pet/components/PetCardHeader'
import usePetHomeScene from '@/features/pet/hooks/usePetHomeScene'
import PetSceneView from '@/features/pet/render/PetSceneView'

/** The card's padding; the room takes taps in it too. */
const PAD = 16

/**
 * Home's Pet Companion card: the pet's name and hearts above its room. Tap the
 * pet to pat it (or wake it), drag across it to rub; tap anywhere else on the
 * card to open its details (hats and decorating). Long-press the header to
 * rename it, change it, decorate its room or open its share card. Renders
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
  if (!scene) return null
  const { life, name } = scene
  const sleeping = life.dead || life.asleep
  const openDetails = (from: 'header' | 'room' | 'menu') => {
    analytics.capture('pet_details_opened', { from })
    navigation.navigate('PetRoom')
  }

  return (
    <Card style={{ gap: 0, paddingVertical: 0, paddingHorizontal: 0 }}>
      <HomeSectionMenu
        accessibilityLabel={name}
        hoverRadius={theme.numbers.borderRadiusLg}
        onPress={() => openDetails('header')}
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
            onPress: () => openDetails('menu'),
          },
          {
            id: 'pet_share',
            title: i18n.t('pet.menu.share'),
            systemImage: 'square.and.arrow.up',
            onPress: () => {
              analytics.capture('pet_share_opened', { from: 'menu' })
              navigation.navigate('PetShare')
            },
          },
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingTop: PAD,
            paddingBottom: PAD - 4,
            paddingHorizontal: PAD,
          }}
        >
          <View style={{ flex: 1 }}>
            <PetCardHeader name={name} life={life} />
          </View>
          <LucideIcon
            icon={ChevronForwardIcon}
            size={16}
            color={theme.colors.textAlt}
          />
        </View>
      </HomeSectionMenu>
      <PetSceneView
        ref={scene.sceneRef}
        input={scene.input}
        pauseOffScreen
        touchInset={PAD}
        onRoomTap={() => openDetails('room')}
        borderRadius={theme.numbers.borderRadiusMd}
        accessibilityLabel={i18n.t('pet.a11y.scene', { name })}
        accessibilityHint={i18n.t(
          sleeping ? 'pet.a11y.wakeHint' : 'pet.a11y.patHint'
        )}
        onPat={scene.onPat}
        onTrick={scene.onTrick}
        onTwirl={scene.onTwirl}
        onWakeRequest={scene.wake}
        onGiftTap={scene.collectGift}
      />
      {life.dead && (
        <View style={{ paddingHorizontal: PAD, paddingBottom: PAD }}>
          <ActionButton onPress={scene.wake}>
            {i18n.t('pet.wakeButton', { name })}
          </ActionButton>
        </View>
      )}
    </Card>
  )
}
