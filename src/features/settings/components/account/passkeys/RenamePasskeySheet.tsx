import { useEffect, useRef, useState } from 'react'
import { Platform, TextInput as RNTextInput, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Sheet from '@/components/ui/Sheet'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { renameAccountPasskey } from '@/app/account/passkeys'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { passkeyFailureFor } from '@/lib/serverAccount/passkeyClient'
import {
  normalizePasskeyName,
  PASSKEY_NAME_MAX,
} from '@/lib/serverAccount/passkeyName'

export type RenamingPasskey = {
  credentialId: string

  name: string | null
}

type Props = {
  passkey: RenamingPasskey | null

  accountName: string | null

  onClosed: (renamed: boolean) => void
}

export default function RenamePasskeySheet({
  passkey,
  accountName,
  onClosed,
}: Props) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  const [closing, setClosing] = useState(false)
  const renamed = useRef(false)

  return (
    <Sheet
      open={passkey !== null && !closing}
      onOpenChange={(open) => {
        if (!open) setClosing(true)
      }}
      onClosed={() => {
        const done = renamed.current
        renamed.current = false
        setClosing(false)
        onClosed(done)
      }}
      dismissible={!busy}
      backgroundColor={theme.colors.card}
      testID='rename-passkey-sheet'
    >
      {passkey && (
        <RenameForm
          passkey={passkey}
          accountName={accountName}
          busy={busy}
          setBusy={setBusy}
          onDone={() => {
            renamed.current = true
            setClosing(true)
          }}
        />
      )}
    </Sheet>
  )
}

function failureMessage(error: unknown): string {
  switch (passkeyFailureFor(error).failure) {
    case 'offline':
      return i18n.t('passkeys_failedOffline')
    case 'rateLimited':
      return i18n.t('passkeys_failedRateLimited')
    case 'updateRequired':
      return i18n.t('passkeys_failedUpdate')
    default:
      return i18n.t('passkeys_failed')
  }
}

function RenameForm({
  passkey,
  accountName,
  busy,
  setBusy,
  onDone,
}: {
  passkey: RenamingPasskey
  accountName: string | null
  busy: boolean
  setBusy: (busy: boolean) => void
  onDone: () => void
}) {
  const theme = useTheme()
  const [name, setName] = useState(passkey.name ?? '')
  const [failure, setFailure] = useState<string | null>(null)
  const input = useRef<RNTextInput>(null)

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const timer = setTimeout(() => input.current?.focus(), 300)
    return () => clearTimeout(timer)
  }, [])

  const changed = normalizePasskeyName(name) !== (passkey.name ?? '')

  const save = async () => {
    if (!changed || busy) return
    setBusy(true)
    setFailure(null)
    try {
      await renameAccountPasskey(passkey.credentialId, name)
      onDone()
    } catch (error) {
      logger.warn('[passkeys] rename failed', error)
      setFailure(failureMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text
        accessibilityRole='header'
        style={{ fontSize: theme.fontSize('lg'), fontFamily: theme.fonts.bold }}
      >
        {i18n.t('passkeys_renameTitle')}
      </Text>
      <Text style={{ color: theme.colors.textAlt }}>
        {accountName
          ? i18n.t('passkeys_renameDescription', { name: accountName })
          : i18n.t('passkeys_renameDescriptionNoName')}
      </Text>
      <TextInput
        ref={input}
        autoFocus
        value={name}
        onChangeText={(text) => {
          setName(text)
          setFailure(null)
        }}
        textAlign='start'
        placeholder={i18n.t('passkeys_namePlaceholder')}
        accessibilityLabel={i18n.t('passkeys_nameLabel')}
        maxLength={PASSKEY_NAME_MAX}
        autoCapitalize='words'
        autoCorrect={false}
        clearButtonMode='while-editing'
        readOnly={busy}
        returnKeyType='done'
        onSubmitEditing={() => void save()}
        testID='rename-passkey-name'
      />
      {failure && (
        <Text
          accessibilityLiveRegion='polite'
          testID='rename-passkey-failed'
          style={{ fontSize: theme.fontSize('sm'), color: theme.colors.error }}
        >
          {failure}
        </Text>
      )}
      <ActionButton
        onPress={() => void save()}
        disabled={!changed}
        loading={busy}
        testID='rename-passkey-save'
      >
        {i18n.t('save')}
      </ActionButton>
    </View>
  )
}
