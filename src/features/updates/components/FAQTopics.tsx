import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import { FAQ_CATEGORIES, FAQCategory } from '@/features/updates/constants/faqs'

export type FAQTopic = FAQCategory | 'pinned' | 'all' | 'support'

export const faqTopicTitle = (topic: FAQTopic) =>
  i18n.t(
    topic === 'pinned'
      ? 'faq_pinnedHeader'
      : topic === 'all'
        ? 'faq_allHeader'
        : topic === 'support'
          ? 'faq_stillNeedHelp'
          : (`faq_category_${topic}` as TranslationKey)
  )

export default function FAQTopics({
  selected,
  onSelect,
}: {
  selected?: FAQTopic
  onSelect: (topic: FAQTopic) => void
}) {
  const theme = useTheme()
  const topics: FAQTopic[] = ['pinned', 'all', ...FAQ_CATEGORIES, 'support']
  return (
    <View style={{ gap: 4, paddingHorizontal: 12 }}>
      {topics.map((topic) => (
        <Button
          key={topic}
          noTransform
          onPress={() => onSelect(topic)}
          accessibilityState={{ selected: selected === topic }}
          style={{
            minHeight: 48,
            padding: 12,
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor:
              selected === topic
                ? theme.colors.accentTranslucent
                : 'transparent',
          }}
        >
          <Text
            style={{
              fontFamily:
                selected === topic ? theme.fonts.semiBold : theme.fonts.regular,
            }}
          >
            {faqTopicTitle(topic)}
          </Text>
        </Button>
      ))}
    </View>
  )
}
