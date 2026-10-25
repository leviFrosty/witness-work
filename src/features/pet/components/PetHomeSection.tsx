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
import type { PetVisit } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import PetCardHeader from '@/features/pet/components/PetCardHeader'
import PetVisitPreview from '@/features/pet/components/PetVisitPreview'
import usePetHomeScene from '@/features/pet/hooks/usePetHomeScene'
import {
  petVisitLine,
  petVisitMenu,
  visitingPetName,
} from '@/features/pet/lib/visits'
import PetSceneView from '@/features/pet/render/PetSceneView'

/** The card's padding; the room takes taps in it too. */
const PAD = 16

/**
 * Home's Pet Companion card: the pet's name and hearts above its room. Tap the
 * pet to pat it (or wake it), drag across it to rub; tap anywhere else on the
 * card to open its details (hats and decorating). Long-press the header to
 * rename it, change it, decorate its room or open its share card. Buddies' pets
 * visiting today sit in the room: once a pat's hearts float off, each says who
 * it came with, and a long press on one opens what the User does with its buddy
 * today. Renders nothing without a companion.
 */
export default function PetHomeSection({
  visits,
  onHideVisit,
}: {
  /** Buddies' pets visiting today. */
  visits: readonly PetVisit[]
  /** Hides a visiting pet's buddy's pets (the Buddies setting). */
  onHideVisit?: (visit: PetVisit) => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const scene = usePetHomeScene(visits)
  if (!scene) return null
  const { life, name } = scene
  const shownVisits = scene.visits
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
        accessibilityLabel={
          shownVisits.length
            ? i18n.t('pet.a11y.sceneWithVisitors', {
                name,
                visitors: shownVisits
                  .map((visit) =>
                    i18n.t('pet.a11y.visitor', {
                      pet: visitingPetName(visit),
                      name: visit.buddyName,
                    })
                  )
                  .join(', '),
              })
            : i18n.t('pet.a11y.scene', { name })
        }
        accessibilityHint={i18n.t(
          sleeping ? 'pet.a11y.wakeHint' : 'pet.a11y.patHint'
        )}
        onPat={scene.onPat}
        onTrick={scene.onTrick}
        onTwirl={scene.onTwirl}
        onWakeRequest={scene.wake}
        onGiftTap={scene.collectGift}
        visitorLines={shownVisits.map(petVisitLine)}
        visitorPreviews={shownVisits.map((visit) => (
          <PetVisitPreview key={visit.inboxId} visit={visit} />
        ))}
        visitorMenus={shownVisits.map((visit) =>
          petVisitMenu(visit, {
            navigation,
            surface: 'home',
            onHide: onHideVisit,
          })
        )}
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
