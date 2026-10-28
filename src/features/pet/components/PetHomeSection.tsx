import { useEffect, useRef } from 'react'
import { PixelRatio, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { registerRewardTarget } from '@/stores/rewardStack'
import type { PetVisit } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import { VIEW_CARD } from '@/features/pet/art'
import PetCardHeader from '@/features/pet/components/PetCardHeader'
import PetVisitPreview from '@/features/pet/components/PetVisitPreview'
import PetWalletCounts from '@/features/pet/components/PetWalletCounts'
import RewardFlights from '@/features/pet/components/RewardFlights'
import usePetHomeScene from '@/features/pet/hooks/usePetHomeScene'
import {
  petVisitLine,
  petVisitMenu,
  visitingPetName,
} from '@/features/pet/lib/visits'
import { crispScale } from '@/features/pet/render/crispScale'
import PetSceneView from '@/features/pet/render/PetSceneView'

/** The card's padding; the room takes taps in it too. */
const PAD = 16
/** Points per pixel of the wallet's coin: a 10-pixel coin beside 15 pt. */
const WALLET_ICON_PT = 2

/**
 * Home's Pet Companion card: the pet's name and hearts above its room. Tap the
 * pet to pat it (or wake it), drag across it to rub; tap anywhere else on the
 * card to open its details (hats and decorating). Long-press the header to
 * rename it, change it, decorate its room or open its share card. Buddies' pets
 * visiting today sit in the room: once a pat's hearts float off, each says who
 * it came with, and a long press on one opens what the User does with its buddy
 * today. A red "New" chip shows while an owned Shop item was never picked.
 * Renders nothing without a companion.
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
  const cardRef = useRef<View>(null)
  const headerRef = useRef<View>(null)
  const sceneBoxRef = useRef<View>(null)
  const coinRef = useRef<View>(null)
  const scene = usePetHomeScene(visits, headerRef)
  // What was earned elsewhere plays over the room, and lands on the coins.
  useEffect(() => {
    const releaseScene = registerRewardTarget('cardScene', sceneBoxRef)
    const releaseCount = registerRewardTarget('card', coinRef)
    return () => {
      releaseScene()
      releaseCount()
    }
  }, [])
  if (!scene) return null
  const { life, name, reveal } = scene
  const shownVisits = scene.visits
  const iconScale = crispScale(WALLET_ICON_PT, 1, PixelRatio.get())
  const sleeping = life.dead || life.asleep
  const openDetails = (from: 'header' | 'room' | 'menu') => {
    analytics.capture('pet_details_opened', { from })
    navigation.navigate('PetRoom')
  }

  return (
    <Card style={{ gap: 0, paddingVertical: 0, paddingHorizontal: 0 }}>
      <View ref={cardRef} collapsable={false}>
        <HomeSectionMenu
          accessibilityLabel={
            scene.hasNewItems
              ? `${name}, ${i18n.t('pet.room.secret.new')}`
              : name
          }
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
              onPress: () =>
                navigation.navigate('PetPicker', { mode: 'change' }),
            },
            {
              id: 'pet_decorate',
              title: i18n.t('pet.menu.decorate'),
              systemImage: 'paintbrush',
              onPress: () => openDetails('menu'),
            },
            {
              id: 'pet_shop',
              title: i18n.t('pet.menu.shop'),
              systemImage: 'storefront',
              onPress: () => navigation.navigate('PetShop', { from: 'menu' }),
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
            ref={headerRef}
            collapsable={false}
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
              <PetCardHeader
                name={name}
                life={life}
                heartPulse={reveal.heart}
              />
            </View>
            {scene.hasNewItems && (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 99,
                  backgroundColor: theme.colors.error,
                }}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize('xs'),
                    fontFamily: theme.fonts.semiBold,
                    color: '#ffffff',
                  }}
                >
                  {i18n.t('pet.room.secret.new')}
                </Text>
              </View>
            )}
            <PetWalletCounts
              coins={reveal.shown.coins}
              pulse={reveal.coins}
              fontSize={theme.fontSize('md')}
              iconScale={iconScale}
              iconRef={coinRef}
            />
            <LucideIcon
              icon={ChevronForwardIcon}
              size={16}
              color={theme.colors.textAlt}
            />
          </View>
        </HomeSectionMenu>
        <View ref={sceneBoxRef} collapsable={false}>
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
        </View>
        {life.dead && (
          <View style={{ paddingHorizontal: PAD, paddingBottom: PAD }}>
            <ActionButton onPress={scene.wake}>
              {i18n.t('pet.wakeButton', { name })}
            </ActionButton>
          </View>
        )}
        <RewardFlights
          pulse={reveal.coins}
          containerRef={cardRef}
          sceneRef={sceneBoxRef}
          viewport={VIEW_CARD}
          iconRef={coinRef}
          iconScale={iconScale}
        />
      </View>
    </Card>
  )
}
