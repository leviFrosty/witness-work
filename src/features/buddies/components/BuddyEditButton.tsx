import { useNavigation } from '@react-navigation/native'
import { Pencil as PencilIcon } from 'lucide-react-native'
import { View } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddyEditButton({ inboxId }: { inboxId: string }) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const exists = useBuddies((state) =>
    state.buddies.some((buddy) => buddy.inboxId === inboxId)
  )
  if (!exists) return null
  const label = i18n.t('buddies_editBuddy')
  return (
    <View style={{ position: 'absolute', right: 0 }}>
      <PointerTooltip label={label}>
        <IconButton
          icon={PencilIcon}
          size='xl'
          accessibilityLabel={label}
          iconStyle={{ color: theme.colors.text }}
          onPress={() => navigation.navigate('BuddyEdit', { inboxId })}
        />
      </PointerTooltip>
    </View>
  )
}
