import { useEffect } from 'react'
import { ScrollView, Switch, View } from 'react-native'
import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import Wrapper from '../components/layout/Wrapper'
import Text from '../components/MyText'
import ActionButton from '../components/ActionButton'
import Button from '../components/Button'
import useTheme from '../contexts/theme'
import { useRollover } from '../hooks/useRollover'
import i18n from '../lib/locales'
import { RootStackNavigation } from '../types/rootStack'

const RolloverScreen = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { availablePending, apply, dismiss, autoEnabled, setAutoEnabled } =
    useRollover()
  // Display-side computations need the marker-agnostic list — the screen can
  // be reached via the inline "Roll over previous month?" card after the user
  // already pressed "Not now" or deleted the entries, in which case the
  // marker-respecting `pending` would be empty even though there's still
  // fractional time available.
  const pending = availablePending
  const totalMinutes = pending.reduce((sum, p) => sum + p.minutes, 0)

  // If somehow opened with nothing pending (e.g. rapid double-fire after auto
  // mode flipped on), close immediately rather than show an empty screen.
  useEffect(() => {
    if (pending.length === 0) {
      navigation.goBack()
    }
  }, [navigation, pending.length])

  if (pending.length === 0) return null

  const today = moment()
  const destinationLabel = today.format('MMMM')

  const handleApply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    apply()
    navigation.goBack()
  }

  const handleSkip = () => {
    dismiss()
    navigation.goBack()
  }

  return (
    <Wrapper style={{ paddingHorizontal: 24 }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: 32, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            textTransform: 'uppercase',
            letterSpacing: 1.5,
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
          {totalMinutes} min → {destinationLabel}
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
            borderRadius: theme.numbers.borderRadiusSm,
            padding: 16,
            gap: 8,
            marginBottom: 24,
          }}
        >
          {pending.map((p) => {
            const sourceLabel = moment({
              year: p.sourceYear,
              month: p.sourceMonth,
            }).format('MMMM YYYY')
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
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 12,
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
          <Switch value={autoEnabled} onValueChange={setAutoEnabled} />
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
      </ScrollView>
    </Wrapper>
  )
}

export default RolloverScreen
