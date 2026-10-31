import { View } from 'react-native'
import { Plus as PlusIcon } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import useTheme from '@/contexts/theme'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import SectionFooter from '@/features/settings/components/account/SectionFooter'
import PasskeyRow from '@/features/settings/components/account/passkeys/PasskeyRow'
import type { LoadedPasskeys } from '@/app/account/passkeys'
import type { Passkey } from '@/lib/serverAccount/passkeyClient'
import i18n from '@/lib/locales'
import { PASSKEYS_MAX } from '@/lib/serverAccount/passkeyFlow'

/**
 * The account's passkeys, newest first, then Add a Passkey (left out where this
 * device can't make one). With none yet, one line on what a passkey is.
 */
export default function PasskeyListSection({
  loaded,
  canAdd,
  busy,
  onAdd,
  onLetUnlock,
  onRemove,
}: {
  loaded: LoadedPasskeys
  canAdd: boolean
  busy: boolean
  onAdd: () => void
  onLetUnlock: (passkey: Passkey) => void
  onRemove: (passkey: Passkey) => void
}) {
  const theme = useTheme()
  const { passkeys, name, readLabel } = loaded
  const empty = passkeys.length === 0

  return (
    <View style={{ gap: 5 }}>
      <SectionTitle
        text={i18n.t('passkeys_section')}
        info={i18n.t('passkeys_info', { max: PASSKEYS_MAX })}
        alignWithIcons
      />
      {empty && (
        <Text
          testID='passkeys-empty'
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
            paddingHorizontal: 12,
            paddingBottom: 8,
          }}
        >
          {i18n.t('passkeys_empty')}
        </Text>
      )}
      {(!empty || canAdd) && (
        <Section>
          {passkeys.map((passkey, index) => (
            <PasskeyRow
              key={passkey.credentialId}
              passkey={passkey}
              name={name}
              readLabel={readLabel}
              disabled={busy}
              lastInSection={!canAdd && index === passkeys.length - 1}
              onLetUnlock={() => onLetUnlock(passkey)}
              onRemove={() => onRemove(passkey)}
            />
          ))}
          {canAdd && (
            <InputRowButton
              leftIcon={PlusIcon}
              label={i18n.t('passkeys_add')}
              onPress={onAdd}
              disabled={busy}
              lastInSection
            />
          )}
        </Section>
      )}
      {name && !empty && (
        <SectionFooter text={i18n.t('passkeys_footer', { name })} />
      )}
    </View>
  )
}
