import { useEffect, useRef } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import { useScribeUsage } from '@/features/scribe'
import ScribeUsageWindowRow from '@/features/scribe/components/ScribeUsageWindowRow'
import {
  ScribeSupporterNote,
  type RenderSupporterCta,
} from '@/features/scribe/components/ScribeStateCards'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

interface Props {
  renderSupporterCta?: RenderSupporterCta
}

const ScribeUsageScreen = ({ renderSupporterCta }: Props) => {
  const foldColumn = useFoldColumn(640)
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { usage, loading, failed } = useScribeUsage()
  const reported = useRef(false)

  useEffect(() => {
    if (!usage || reported.current) return
    reported.current = true
    analytics.capture('scribe_usage_viewed', {
      surface: 'settings',
      plan: usage.plan,
      limited: usage.limited,
    })
  }, [usage])

  const upgrade = () => {
    analytics.capture('scribe_upsell_tapped', { surface: 'usage' })
    navigation.navigate('Paywall', {
      initialTier: 'supporter',
      source: 'scribe_usage',
    })
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 20 }}
    >
      {}
      <View
        style={[
          { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 18 },
          foldColumn,
        ]}
      >
        {!usage ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            {loading && !failed ? (
              <ActivityIndicator color={theme.colors.textAlt} />
            ) : (
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('md'),
                  textAlign: 'center',
                }}
              >
                {i18n.t('scribe_usageUnavailable')}
              </Text>
            )}
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t(
                  usage.plan === 'supporter'
                    ? 'scribe_usagePlanSupporter'
                    : 'scribe_usagePlanFree'
                )}
              </Text>
              <InfoPopover
                inline
                title={i18n.t('scribe_usageInfoTitle')}
                description={i18n.t('scribe_usageInfoBody')}
              />
            </View>
            <View
              style={{
                borderRadius: theme.numbers.borderRadiusLg,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
                padding: 16,
                gap: 18,
              }}
            >
              {usage.windows.map((window) => (
                <ScribeUsageWindowRow key={window.id} window={window} />
              ))}
            </View>
            {failed ? (
              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('scribe_usageStale')}
              </Text>
            ) : null}
            <ScribeSupporterNote
              plan={usage.plan}
              supporterCheckFailed={usage.supporterCheckFailed}
              onUpgrade={upgrade}
              renderSupporterCta={renderSupporterCta}
              fontSize={theme.fontSize('md')}
            />
          </>
        )}
      </View>
    </ScrollView>
  )
}

export default ScribeUsageScreen
