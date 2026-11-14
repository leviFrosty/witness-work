import { Store as StoreIcon } from 'lucide-react-native'
import Switch from '@/components/ui/Switch'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import { SECRET_ROOM_ITEMS } from '@/types/pet'
import { petHarness } from '@/app/dev-harness/pet'
import {
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubsection,
} from '@/app/navigation/tools/ToolsUI'
import usePetLife from '@/features/pet/hooks/usePetLife'
import { coinsOf } from '@/features/pet/lib/currency'

export default function WalletTools() {
  const { pet, wallet, earnings } = usePetLife()
  const showStreaks = usePreferences((state) => state.showStreaks)
  if (!pet) return null

  const everyItem = pet.earnedRoomItems?.includes(
    SECRET_ROOM_ITEMS[SECRET_ROOM_ITEMS.length - 1]
  )

  return (
    <ToolSection
      title='Shop & earnings'
      icon={StoreIcon}
      keywords='wallet coins'
      summary={`${pet.earnedRoomItems?.length ?? 0} items · ${pet.purchases?.length ?? 0} bought`}
    >
      <ToolSubsection
        title='Shop'
        info='Stored on the pet and synced, like the real thing.'
      >
        <ToolList>
          <ToolRow
            label={`Unlock whole Shop (${pet.earnedRoomItems?.length ?? 0})`}
            info='On owns every hat and room item, secrets too, as earned: nothing is spent. Off locks them all but the starters, purchases included; secrets the records have earned (badges) come straight back.'
            trailing={
              <Switch
                value={!!everyItem}
                onValueChange={(on) => void petHarness.items(on)}
                accessibilityLabel='Unlock whole Shop'
              />
            }
          />
          <ToolRow
            label={`Refund purchases (${pet.purchases?.length ?? 0})`}
            onPress={() => {
              petHarness.refund()
              toast.info('Purchases refunded')
            }}
          />
        </ToolList>
      </ToolSubsection>

      <ToolSubsection
        title='Earned'
        info='The real coins: what is left to spend, and what earned it since adoption (ADR 0035). Fake coins do not show here.'
      >
        <ToolList>
          <ToolRow
            label='Coins'
            value={`${pet.purchases?.length ? `${wallet} left of ` : ''}${coinsOf(earnings)}`}
          />
          <ToolRow label='Days out' value={`${earnings.daysOut}`} />
          <ToolRow label='Planned days kept' value={`${earnings.plansKept}`} />
          <ToolRow label='Monthly least added' value={`${earnings.shared}`} />
          <ToolRow
            label='Streak milestones'
            value={
              showStreaks
                ? earnings.milestones.map(({ count }) => count).join(', ') ||
                  'none'
                : 'streaks hidden'
            }
          />
        </ToolList>
      </ToolSubsection>
    </ToolSection>
  )
}
