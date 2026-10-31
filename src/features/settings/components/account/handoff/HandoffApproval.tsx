import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { HandoffHello } from '@/lib/serverAccount/handoff'
import AnswerButtons from '@/features/settings/components/account/handoff/AnswerButtons'
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
      <AnswerButtons
        sending={sending}
        onYes={onAllow}
        onNo={onDecline}
        testIDPrefix='handoff'
      />
    </View>
  )
}
