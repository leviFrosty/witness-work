import { useEffect } from 'react'
import Animated, {
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
} from 'react-native-reanimated'
import { analytics } from '@/lib/analytics'
import { canvasKitComponent } from '@/lib/canvasKit/canvasKitComponent'
import { usePreferences } from '@/stores/preferences'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import type { Buddy } from '@/features/buddies/lib/state'
import type SharedPetRoomCardComponent from '@/features/pet/components/SharedPetRoomCard'

const SharedPetRoomCard = canvasKitComponent(
  (): typeof SharedPetRoomCardComponent =>
    require('@/features/pet/components/SharedPetRoomCard').default
)

export default function BuddyPetRoomSection({ buddy }: { buddy: Buddy }) {
  const petsOn = usePreferences(
    (state) => state.homeScreenElements.pet !== false
  )
  const pet = buddy.status === 'active' && petsOn ? buddy.pet : undefined
  const shown = pet !== undefined

  useEffect(() => {
    if (shown) analytics.capture('buddy_pet_room_viewed')
  }, [shown])

  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      {pet && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
        >
          <SharedPetRoomCard
            pet={pet}
            ownerName={buddyDisplayName(buddy)}
            seedKey={buddy.inboxId}
          />
        </Animated.View>
      )}
    </LayoutAnimationConfig>
  )
}
