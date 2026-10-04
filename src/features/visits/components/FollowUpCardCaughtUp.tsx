import { CircleCheck as CircleCheckIcon } from 'lucide-react-native'
import LottieView from 'lottie-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import type { FollowUpCardItem } from '@/lib/conversations'
import i18n, { type TranslationKey } from '@/lib/locales'

type Props = {
  items: FollowUpCardItem[]
  /** Play the check animation: the last one was just answered. */
  celebrate: boolean
  onDone: () => void
}

/** Shown once every Follow-up on the card is answered. */
export default function FollowUpCardCaughtUp({
  items,
  celebrate,
  onDone,
}: Props) {
  const theme = useTheme()
  const notAtHome = items.filter((i) => i.answeredBy?.notAtHome).length
  const conversations = items.length - notAtHome
  const summary = [
    conversations > 0 &&
      i18n.t('followUpCard_conversations' as TranslationKey, {
        count: conversations,
      }),
    notAtHome > 0 &&
      i18n.t('followUpCard_notAtHome' as TranslationKey, { count: notAtHome }),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <View
      style={{
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 20,
        paddingBottom: 4,
      }}
    >
      {celebrate ? (
        <LottieView
          autoPlay
          loop={false}
          speed={0.875}
          style={{ width: 120, height: 88, marginVertical: -14 }}
          source={require('@/assets/lottie/checkMark.json')}
        />
      ) : (
        <LucideIcon
          icon={CircleCheckIcon}
          size={44}
          color={theme.colors.accent}
        />
      )}
      <Text
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('md'),
          textAlign: 'center',
        }}
      >
        {i18n.t('followUpCard_allCaughtUp')}
      </Text>
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          textAlign: 'center',
        }}
      >
        {summary}
      </Text>
      <Button
        onPress={onDone}
        style={{
          marginTop: 6,
          minHeight: 40,
          paddingHorizontal: 20,
          justifyContent: 'center',
          borderRadius: theme.numbers.borderRadiusSm,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('done')}
        </Text>
      </Button>
    </View>
  )
}
