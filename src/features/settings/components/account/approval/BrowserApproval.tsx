import { View } from 'react-native'
import {
  MapPin as MapPinIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { ApprovalAsking } from '@/features/settings/components/account/approval/approvalView'
import {
  approvalBrowserLine,
  approvalPlace,
} from '@/features/settings/components/account/approval/approvalView'
import AnswerButtons from '@/features/settings/components/account/handoff/AnswerButtons'
import HandoffCode from '@/features/settings/components/account/handoff/HandoffCode'

/**
 * A computer's browser asks to sign in: which browser and system it says it is,
 * roughly where it is, the code to compare, a warning when it seems far away,
 * and the User's answer. `host` is the web app's host from the scanned code.
 * `sendFailed` when a YES didn't get through.
 */
export default function BrowserApproval({
  state,
  host,
  sending,
  onAllow,
  onDecline,
}: {
  state: ApprovalAsking
  host: string
  sending: boolean
  onAllow: () => void
  onDecline: () => void
}) {
  const theme = useTheme()
  const sendFailed = state.step === 'confirm' && state.sendFailed === true
  return (
    <View style={{ flex: 1, alignSelf: 'stretch' }} testID='approval-confirm'>
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
          {i18n.t('approval_allowTitle')}
        </Text>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text
            style={{ fontFamily: theme.fonts.semiBold, textAlign: 'center' }}
            testID='approval-browser'
          >
            {approvalBrowserLine(state.hello)}
          </Text>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            testID='approval-place'
          >
            <LucideIcon
              icon={MapPinIcon}
              size={14}
              color={theme.colors.textAlt}
            />
            <Text style={{ color: theme.colors.textAlt, textAlign: 'center' }}>
              {approvalPlace(state.location)}
            </Text>
          </View>
        </View>
        {state.far && (
          <View
            accessibilityRole='alert'
            style={{
              flexDirection: 'row',
              gap: 10,
              padding: 12,
              maxWidth: 360,
              alignSelf: 'stretch',
              borderRadius: theme.numbers.borderRadiusSm,
              backgroundColor: theme.colors.warnTranslucent,
            }}
            testID='approval-far'
          >
            <LucideIcon
              icon={TriangleAlertIcon}
              size={18}
              color={theme.colors.warnText}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: theme.fonts.semiBold }}>
                {i18n.t('approval_farTitle')}
              </Text>
              <Text>{i18n.t('approval_farBody')}</Text>
            </View>
          </View>
        )}
        <HandoffCode code={state.code} />
        <Text style={{ textAlign: 'center', maxWidth: 320 }}>
          {i18n.t('approval_matchCode')}
        </Text>
        <Text
          style={{
            textAlign: 'center',
            maxWidth: 320,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('approval_onlyYours', { host })}
        </Text>
        {sendFailed && !sending && (
          <Text
            accessibilityRole='alert'
            style={{ color: theme.colors.error, textAlign: 'center' }}
            testID='approval-send-failed'
          >
            {i18n.t('approval_sendFailed')}
          </Text>
        )}
      </View>
      <AnswerButtons
        sending={sending}
        onYes={onAllow}
        onNo={onDecline}
        testIDPrefix='approval'
      />
    </View>
  )
}
