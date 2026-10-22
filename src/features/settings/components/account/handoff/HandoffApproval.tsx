import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { HandoffHello } from '@/lib/serverAccount/handoff'
import HandoffCode from '@/features/settings/components/account/handoff/HandoffCode'
import { HandoffTextButton } from '@/features/settings/components/account/handoff/HandoffStatus'
import { handoffDeviceLine } from '@/features/settings/components/account/handoff/handoffCopy'

/**
 * A phone claimed the code: who it says it is, the code to compare, and the
 * User's answer. `sendFailed` when an Allow didn't get through.
 */
export default function HandoffApproval({
  hello,
  code,
  sending,
  sendFailed = false,
  onAllow,
  onDecline,
}: {
  hello: HandoffHello
  code: string
  sending: boolean
  sendFailed?: boolean
  onAllow: () => void
  onDecline: () => void
}) {
  const theme = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: 16 }} testID='handoff-approval'>
      <Text
        accessibilityRole='header'
        style={{
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.bold,
          textAlign: 'center',
        }}
      >
        {i18n.t('handoff_allowTitle', { device: hello.deviceName })}
      </Text>
      <Text style={{ color: theme.colors.textAlt }}>
        {handoffDeviceLine(hello)}
      </Text>
      <HandoffCode code={code} />
      <Text style={{ textAlign: 'center', maxWidth: 320 }}>
        {i18n.t('handoff_matchCode')}
      </Text>
      {sendFailed && !sending && (
        <Text
          accessibilityRole='alert'
          style={{ color: theme.colors.error, textAlign: 'center' }}
          testID='handoff-allow-failed'
        >
          {i18n.t('handoff_allowFailed')}
        </Text>
      )}
      <View style={{ alignSelf: 'stretch', gap: 4, marginTop: 8 }}>
        <ActionButton
          onPress={onAllow}
          loading={sending}
          disabled={sending}
          testID='handoff-allow'
        >
          {i18n.t('handoff_allow')}
        </ActionButton>
        {!sending && (
          <View style={{ alignItems: 'center' }}>
            <HandoffTextButton
              label={i18n.t('handoff_dontAllow')}
              onPress={onDecline}
              tone='error'
              testID='handoff-decline'
            />
          </View>
        )}
      </View>
    </View>
  )
}
