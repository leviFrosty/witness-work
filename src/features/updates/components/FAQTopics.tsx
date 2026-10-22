import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { HelpCategory } from '@/features/updates/types/helpCenter'

/** A category id, or one of the screen's own sections. */
export type FAQTopic = string

export const faqTopicTitle = (topic: FAQTopic, categories: HelpCategory[]) =>
  topic === 'pinned'
    ? i18n.t('faq_pinnedHeader')
    : topic === 'all'
      ? i18n.t('faq_allHeader')
      : topic === 'support'
        ? i18n.t('faq_stillNeedHelp')
        : (categories.find((category) => category.id === topic)?.title ?? '')

export default function FAQTopics({
  categories,
  selected,
  onSelect,
}: {
  categories: HelpCategory[]
  selected?: FAQTopic
  onSelect: (topic: FAQTopic) => void
}) {
  const theme = useTheme()
  const topics: FAQTopic[] = [
    'pinned',
    'all',
    ...categories.map((category) => category.id),
    'support',
  ]
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
            {faqTopicTitle(topic, categories)}
          </Text>
        </Button>
      ))}
    </View>
  )
}
