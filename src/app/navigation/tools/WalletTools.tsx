import { Coins as CoinsIcon } from 'lucide-react-native'
import ChoiceChips from '@/components/ui/ChoiceChips'
import Switch from '@/components/ui/Switch'
import usePet from '@/stores/pet'
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'
import { SECRET_ROOM_ITEMS } from '@/types/pet'
import { petHarness } from '@/app/dev-harness/pet'
import {
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'
import { coinsOf } from '@/features/pet/lib/currency'
import { FAKE_WALLETS, fakeWalletWorks } from '@/features/pet/lib/fakeWallet'
import { petEarningsNow } from '@/features/pet/lib/walletNow'
import { usePetSeen } from '@/features/pet/stores/petSeen'
import { usePetSession } from '@/features/pet/stores/petSession'

const REAL = 'real'

export default function WalletTools() {
  const pet = usePet((state) => state.pet)
  const showStreaks = usePreferences((state) => state.showStreaks)
  const faked = usePetSession((state) => state.devOverride?.wallet)

  usePetSeen((state) => state.seen)
  const earnings = pet ? petEarningsNow() : null
  if (!pet) return null

  const canFake = fakeWalletWorks()
  const everyItem = pet.earnedRoomItems?.includes(
    SECRET_ROOM_ITEMS[SECRET_ROOM_ITEMS.length - 1]
  )

  return (
    <ToolSection
      title='Wallet'
      icon={CoinsIcon}
      summary={
        canFake && faked !== undefined
          ? `${faked.toLocaleString()} fake coins`
          : `${(earnings?.wallet ?? 0).toLocaleString()} coins`
      }
    >
      <ToolSubheading
        title='Shop'
        info='Stored on the pet and synced, like the real thing.'
      />
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

      {canFake && (
        <>
          <ToolSubheading
            title='Fake wallet'
            info='Coins earned, shown on this device only. What is bought still comes off. The top value covers every item in the Shop.'
          />
          <ChoiceChips
            accessibilityLabel='Fake wallet'
            options={[
              { key: REAL, label: REAL },
              ...FAKE_WALLETS.map((coins) => ({
                key: `${coins}`,
                label: coins.toLocaleString(),
              })),
            ]}
            value={faked === undefined ? REAL : `${faked}`}
            onChange={(key) =>
              petHarness.override({
                wallet: key === REAL ? undefined : Number(key),
              })
            }
            style={{ paddingTop: 8 }}
          />
        </>
      )}

      {earnings && (
        <>
          <ToolSubheading
            title='Earned'
            info='What is left to spend, and what earned it since adoption (ADR 0035).'
          />
          <ToolList>
            <ToolRow
              label='Coins'
              value={`${earnings.wallet} of ${coinsOf(earnings.earned)}`}
            />
            <ToolRow label='Days out' value={`${earnings.earned.daysOut}`} />
            <ToolRow
              label='Planned days kept'
              value={`${earnings.earned.plansKept}`}
            />
            <ToolRow
              label='Monthly least added'
              value={`${earnings.earned.shared}`}
            />
            <ToolRow
              label='Streak milestones'
              value={
                showStreaks
                  ? earnings.earned.milestones
                      .map(({ count }) => count)
                      .join(', ') || 'none'
                  : 'streaks hidden'
              }
            />
          </ToolList>
        </>
      )}
    </ToolSection>
  )
}
