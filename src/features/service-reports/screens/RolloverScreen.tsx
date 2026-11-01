import { analytics } from '@/lib/analytics'
import { useEffect } from 'react'
import { ScrollView, View } from 'react-native'
import Switch from '@/components/ui/Switch'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import Haptics from '@/lib/haptics'
import Wrapper from '@/components/ui/layout/Wrapper'
import Text from '@/components/ui/MyText'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import { useRollover } from '@/features/service-reports/hooks/useRollover'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import { useFormattedMinutes } from '@/lib/minutes'
import { tracking } from '@/lib/tracking'
import { formatDisplay } from '@/lib/dates'
import { isRtlLayout } from '@/lib/direction'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

const RolloverScreen = () => {
  const foldColumn = useFoldColumn(680)
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const {
    availablePending,
    excludedCreditMinutes,
    apply,
    dismiss,
    autoEnabled,
    setAutoEnabled,
  } = useRollover()

  const pending = availablePending
  const totalMinutes = pending.reduce((sum, p) => sum + p.minutes, 0)
  const totalDisplay = useFormattedMinutes(totalMinutes)

  useEffect(() => {
    if (pending.length === 0) {
      navigation.goBack()
    }
  }, [navigation, pending.length])

  if (pending.length === 0) return null

  const today = moment()
  const destinationLabel = today.format('MMMM')

  const arrow = isRtlLayout() ? '←' : '→'

  const handleApply = () => {
    Haptics.success()
    apply()
    analytics.capture('time_rollover_apply_requested', {
      source: 'rollover_screen',
    })
    navigation.goBack()
  }

  const handleSkip = () => {
    dismiss()

    navigation.goBack()
  }

  return (
    <Wrapper>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 32,
          paddingBottom: 24,
          paddingHorizontal: 12,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            { width: '100%', maxWidth: 680, alignSelf: 'center' },
            foldColumn,
          ]}
        >
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.semiBold,
              textTransform: 'uppercase',
              letterSpacing: tracking(1.5),
              marginBottom: 8,
            }}
          >
            {i18n.t('timeRollover')}
          </Text>
          <Text
            style={{
              fontSize: 32,
              fontFamily: theme.fonts.bold,
              marginBottom: 16,
            }}
          >
            {totalDisplay.formatted} {arrow} {destinationLabel}
          </Text>
          <Text
            style={{
              fontSize: 15,
              color: theme.colors.textAlt,
              marginBottom: 24,
            }}
          >
            {i18n.t('timeRollover_intro')}
          </Text>

          <View
            style={{
              backgroundColor: theme.colors.backgroundLighter,
              borderRadius: theme.numbers.borderRadiusMd,
              padding: 16,
              gap: 8,
              marginBottom: 24,
            }}
          >
            {pending.map((p) => {
              const sourceLabel = formatDisplay(
                { year: p.sourceYear, month: p.sourceMonth },
                'MMMM YYYY'
              )
              return (
                <Text
                  key={`${p.sourceYear}-${p.sourceMonth}`}
                  style={{ fontSize: 15 }}
                >
                  {i18n.t('timeRollover_movePreview', {
                    minutes: p.minutes,
                    from: sourceLabel,
                    to: destinationLabel,
                  })}
                </Text>
              )
            })}
            {excludedCreditMinutes > 0 && (
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textAlt,
                }}
              >
                {i18n.t('timeRollover_creditExcluded', {
                  minutes: excludedCreditMinutes,
                })}
              </Text>
            )}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 76,
              paddingVertical: 16,
              paddingHorizontal: 12,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: theme.colors.border,
              marginBottom: 24,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 15, fontFamily: theme.fonts.semiBold }}>
                {i18n.t('timeRollover_autoLabel')}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textAlt,
                  marginTop: 2,
                }}
              >
                {i18n.t('timeRollover_autoHint')}
              </Text>
            </View>
            <Switch
              accessibilityLabel={i18n.t('timeRollover_autoLabel')}
              value={autoEnabled}
              onValueChange={(enabled) => {
                setAutoEnabled(enabled)
              }}
            />
          </View>

          <ActionButton onPress={handleApply}>
            {i18n.t('timeRollover_apply')}
          </ActionButton>
          <View style={{ alignItems: 'center', marginTop: 16 }}>
            <Button onPress={handleSkip}>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  textDecorationLine: 'underline',
                }}
              >
                {i18n.t('timeRollover_skip')}
              </Text>
            </Button>
          </View>
        </View>
      </ScrollView>
    </Wrapper>
  )
}

export default RolloverScreen
