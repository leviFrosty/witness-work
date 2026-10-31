import { View } from 'react-native'
import moment from 'moment'
import { UserRoundKey as UserRoundKeyIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import type { DeviceLabelReader } from '@/lib/serverAccount/activityLabels'
import type { Passkey } from '@/lib/serverAccount/passkeyClient'
import { passkeyProvider } from '@/lib/passkeys/providers'
import { formatDate, formatMonthDayCompact, formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'

/** "Oct 18", with the year when it isn't this one. */
const day = (at: number) =>
  moment(at).isSame(moment(), 'year')
    ? formatMonthDayCompact(moment(at))
    : formatDate(at, { style: 'medium' })

/** Its provider, where and when it was added, and when it last signed in. */
function details(passkey: Passkey, readLabel: DeviceLabelReader): string {
  const device = readLabel(passkey.label ?? null)?.name
  return [
    passkeyProvider(passkey.aaguid),
    device
      ? i18n.t('passkeys_addedOn', { device, date: day(passkey.createdAt) })
      : i18n.t('passkeys_added', { date: day(passkey.createdAt) }),
    // The server's clock can run ahead of this device's: never "in a minute".
    passkey.lastUsedAt &&
      i18n.t('passkeys_lastUsed', {
        when: formatRelative(Math.min(passkey.lastUsedAt, Date.now())),
      }),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * One passkey: the account's `WitnessWork <tag>`, its details, and whether it
 * can unlock the account. Tapping it offers Let It Unlock (Sign-in only) and
 * Remove.
 */
export default function PasskeyRow({
  passkey,
  name,
  readLabel,
  disabled,
  lastInSection,
  onLetUnlock,
  onRemove,
}: {
  passkey: Passkey
  /** `WitnessWork <tag>`, or null when the list didn't say. */
  name: string | null
  readLabel: DeviceLabelReader
  disabled: boolean
  lastInSection: boolean
  onLetUnlock: () => void
  onRemove: () => void
}) {
  const theme = useTheme()
  const status = i18n.t(
    passkey.canUnlock ? 'passkeys_canUnlock' : 'passkeys_signInOnly'
  )
  const title = name ?? i18n.t('accountSecurity_passkeys')
  const sublabel = details(passkey, readLabel)

  return (
    <PullDownMenu
      accessibilityLabel={`${title}, ${sublabel}`}
      accessibilityValue={status}
      pointerEffect='tint'
      hoverRadius={0}
      fill
      testID={`passkey-row-${passkey.credentialId}`}
      // Kept while another action runs: a menu without actions draws nothing.
      // The screen ignores a second action until the first ends.
      actions={[
        !passkey.canUnlock && {
          id: 'let-unlock',
          title: i18n.t('passkeys_letItUnlock'),
          systemImage: 'lock.open',
          onPress: onLetUnlock,
        },
        [
          {
            id: 'remove',
            title: i18n.t('remove'),
            systemImage: 'trash',
            destructive: true,
            onPress: onRemove,
          },
        ],
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: inputLayout.labelGap,
          minHeight: 56,
          paddingVertical: 10,
          paddingHorizontal: inputLayout.horizontalPadding,
          borderColor: theme.colors.border,
          borderBottomWidth: lastInSection ? 0 : 1,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <LucideIcon
          icon={UserRoundKeyIcon}
          size={inputLayout.iconSize}
          color={theme.colors.textAlt}
        />
        <View style={{ flexShrink: 1, flexGrow: 1, gap: 4 }}>
          <Text
            style={{
              fontFamily: theme.fonts.medium,
              fontSize: theme.fontSize('md'),
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {sublabel}
          </Text>
          <View
            style={{
              alignSelf: 'flex-start',
              marginTop: 2,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: theme.numbers.borderRadiusLg,
              backgroundColor: passkey.canUnlock
                ? theme.colors.accentTranslucent
                : theme.colors.background,
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('xs'),
                color: passkey.canUnlock
                  ? theme.colors.text
                  : theme.colors.textAlt,
              }}
            >
              {status}
            </Text>
          </View>
        </View>
      </View>
    </PullDownMenu>
  )
}
