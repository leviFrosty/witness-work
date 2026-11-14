import { useState } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Coins as CoinsIcon } from 'lucide-react-native'
import ChoiceChips from '@/components/ui/ChoiceChips'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import Section from '@/components/ui/inputs/Section'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { toAsciiDigits } from '@/lib/digits'
import { toast } from '@/stores/toasts'
import { PET_SPECIES_IDS } from '@/types/pet'
import type { RootStackNavigation } from '@/types/rootStack'
import { petHarness } from '@/app/dev-harness/pet'
import {
  ToolList,
  ToolRow,
  ToolSearchable,
} from '@/app/navigation/tools/ToolsUI'
import usePetLife from '@/features/pet/hooks/usePetLife'
import { coinsOf, spentOn, walletOf } from '@/features/pet/lib/currency'
import {
  FAKE_WALLET_MAX,
  FAKE_WALLET_STEPS,
  fakeWalletWorks,
} from '@/features/pet/lib/fakeWallet'
import { storedPurchases } from '@/features/pet/lib/unlocks'
import { usePetSession } from '@/features/pet/stores/petSession'

const REAL = 'real'
const EMPTY = 'empty'
const MAX = 'max'
const MAX_DIGITS = 6

export default function CoinsTools() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  const { pet, wallet, earnings } = usePetLife()
  const faked = usePetSession((state) => state.devOverride?.wallet)
  const [input, setInput] = useState('')

  const canFake = fakeWalletWorks()
  const isFake = canFake && faked !== undefined
  const realWallet = walletOf(coinsOf(earnings), spentOn(storedPurchases(pet)))

  const setCoins = (balance: number | null) => {
    petHarness.coins(
      balance === null ? null : Math.min(balance, FAKE_WALLET_MAX)
    )
  }

  const typeCoins = (text: string) => {
    const digits = toAsciiDigits(text).replace(/[^0-9]/g, '')
    setInput(digits)
    if (digits) setCoins(Number.parseInt(digits, 10))
  }

  return (
    <ToolSearchable words='Coins wallet fake balance shop'>
      <View style={{ gap: 8 }}>
        <XView style={{ gap: 0, marginStart: inputLayout.horizontalPadding }}>
          <Text
            accessibilityRole='header'
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            Coins
          </Text>
          <InfoPopover
            title='Coins'
            description='What the pet has left to spend in the Shop. A change here is fake: this device shows it, nothing is stored, and buying still takes coins off. Max covers every item in the Shop.'
            inline
          />
        </XView>
        <Section
          animateRows={false}
          style={{
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingTop: 18,
            paddingBottom: inputLayout.rowPadding,
          }}
        >
          {pet ? (
            <>
              <XView style={{ gap: 12 }}>
                <LucideIcon
                  icon={CoinsIcon}
                  size={theme.fontSize('2xl')}
                  color={theme.colors.accent}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    testID='tools-coins-balance'
                    accessibilityLabel={`${wallet.toLocaleString()} coins`}
                    style={{
                      fontFamily: theme.fonts.semiBold,
                      fontSize: theme.fontSize('2xl'),
                    }}
                  >
                    {wallet.toLocaleString()}
                  </Text>
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      color: theme.colors.textAlt,
                    }}
                  >
                    {isFake
                      ? `Fake, on this device. Real: ${realWallet.toLocaleString()}`
                      : canFake
                        ? 'Real coins'
                        : 'Real coins. Fake coins are off in production.'}
                  </Text>
                </View>
                {canFake && (
                  <TextInput
                    testID='tools-coins-input'
                    value={input}
                    placeholder='Set'
                    onChangeText={typeCoins}
                    onBlur={() => setInput('')}
                    inputMode='numeric'
                    enterKeyHint='done'
                    selectTextOnFocus
                    textAlign='center'
                    maxLength={MAX_DIGITS}
                    accessibilityLabel='Set coins'
                    style={{
                      width: 96,
                      minHeight: 44,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                      borderRadius: theme.numbers.borderRadiusSm,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      color: theme.colors.text,
                    }}
                  />
                )}
              </XView>
              {canFake && (
                <ChoiceChips
                  accessibilityLabel='Change coins'
                  options={[
                    { key: REAL, label: 'Real' },
                    { key: EMPTY, label: '0' },
                    ...FAKE_WALLET_STEPS.map((coins) => ({
                      key: `${coins}`,
                      label: `+${coins.toLocaleString()}`,
                    })),
                    { key: MAX, label: 'Max' },
                  ]}
                  value={isFake ? null : REAL}
                  onChange={(key) =>
                    setCoins(
                      key === REAL
                        ? null
                        : key === EMPTY
                          ? 0
                          : key === MAX
                            ? FAKE_WALLET_MAX
                            : wallet + Number(key)
                    )
                  }
                  style={{ paddingTop: 14, paddingBottom: 6 }}
                />
              )}
              <ToolList>
                <ToolRow
                  label='Open Shop'
                  onPress={() => navigation.navigate('PetShop')}
                />
              </ToolList>
            </>
          ) : (
            <>
              <XView style={{ gap: 12 }}>
                <LucideIcon
                  icon={CoinsIcon}
                  size={theme.fontSize('2xl')}
                  color={theme.colors.textAlt}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: theme.fonts.semiBold }}>
                    No pet yet
                  </Text>
                  <Text
                    style={{
                      fontSize: theme.fontSize('sm'),
                      color: theme.colors.textAlt,
                    }}
                  >
                    Coins belong to a pet. Adopt one to change them.
                  </Text>
                </View>
              </XView>
              <ToolList>
                <ToolRow
                  label={`Adopt a ${PET_SPECIES_IDS[0]}`}
                  onPress={() => {
                    petHarness.adopt(PET_SPECIES_IDS[0])
                    toast.info(`Adopted a ${PET_SPECIES_IDS[0]}`)
                  }}
                />
              </ToolList>
            </>
          )}
        </Section>
      </View>
    </ToolSearchable>
  )
}
