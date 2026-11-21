import { useNavigation } from '@react-navigation/native'
import { rewardIcon } from '@/features/pet/components/PetRewardChip'
import { petDisplayName } from '@/features/pet/lib/names'
import { untoldPriceDrop } from '@/features/pet/lib/priceDrop'
import { PRICE_CUT } from '@/features/pet/lib/prices'
import { coinsText } from '@/features/pet/lib/roomLabels'
import {
  settlePriceDrop,
  usePetPriceDrop,
} from '@/features/pet/stores/petPriceDrop'
import i18n from '@/lib/locales'
import usePet from '@/stores/pet'
import type { NotificationItem } from '@/types/notifications'
import type { RootStackNavigation } from '@/types/rootStack'

const PRICE_DROP_COIN_PT = 28

export const PRICE_DROP_NOTIFICATION_ID = `pet_price_drop:${PRICE_CUT}`

export default function usePetPriceDropNotification(): NotificationItem | null {
  const navigation = useNavigation<RootStackNavigation>()
  const pet = usePet((s) => s.pet)
  const settled = usePetPriceDrop((s) => s.settled)
  const refund = untoldPriceDrop(pet, settled)
  if (!pet || refund <= 0) return null
  const name = petDisplayName(pet)

  return {
    id: PRICE_DROP_NOTIFICATION_ID,
    kind: 'pet_price_drop',
    art: () => rewardIcon(PRICE_DROP_COIN_PT),
    tone: 'accent',
    title: i18n.t('pet.priceDrop.title', { name }),
    description: i18n.t('pet.priceDrop.description', {
      coins: coinsText(refund),
    }),
    actions: [
      {
        id: 'shop',
        label: i18n.t('pet.priceDrop.shop'),
        onPress: () => {
          settlePriceDrop(PRICE_CUT)
          navigation.navigate('PetShop', { from: 'price_drop' })
        },
      },
    ],
    onDismiss: () => settlePriceDrop(PRICE_CUT),
  }
}
