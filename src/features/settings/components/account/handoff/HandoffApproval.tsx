import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { HandoffHello } from '@/lib/serverAccount/handoff'
import HandoffCode from '@/features/settings/components/account/handoff/HandoffCode'
import { handoffDeviceLine } from '@/features/settings/components/account/handoff/handoffCopy'

/**
 * A phone claimed the code: who it says it is, the code to compare, and the
 * User's answer, No or Yes side by side at the bottom of the screen.
 * `sendFailed` when a Yes didn't get through.
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
    <View style={{ flex: 1, alignSelf: 'stretch' }} testID='handoff-approval'>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
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
      </View>
      {/* The answer, side by side at the bottom: No first, as the system's
          own confirmations order them. */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
        {/* Each in a flex box: flex-basis 0 leaves out padding, so the
            outlined button would come out wider. */}
        <View style={{ flex: 1 }}>
          <Button
            variant='outline'
            onPress={onDecline}
            disabled={sending}
            style={{
              justifyContent: 'center',
              // Yes's padding, less this one's 1pt border, so they match.
              paddingVertical: 11,
              borderRadius: theme.numbers.borderRadiusSm,
              opacity: sending ? 0.5 : 1,
            }}
            testID='handoff-decline'
          >
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                fontFamily: theme.fonts.bold,
              }}
            >
              {i18n.t('handoff_dontAllow')}
            </Text>
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton
            onPress={onAllow}
            loading={sending}
            disabled={sending}
            testID='handoff-allow'
          >
            {i18n.t('handoff_allow')}
          </ActionButton>
        </View>
      </View>
    </View>
  )
}
