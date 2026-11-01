import { RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { Keyboard, ScrollView, View } from 'react-native'
import CustomFieldPrivacyWarning from '@/components/CustomFieldPrivacyWarning'
import Chip from '@/components/ui/Chip'
import Text from '@/components/ui/MyText'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import useTheme from '@/contexts/theme'
import {
  contactCustomFieldHistory,
  customFieldSuggestions,
  customFieldValueIndex,
} from '@/features/visits/lib/customFieldSuggestions'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import { CustomFieldDefinition } from '@/types/customField'

const REVEAL_MARGIN = 12

const revealAboveKeyboard = (
  view: RefObject<View | null>,
  scrollBy: (dy: number) => void
) => {
  const keyboard = Keyboard.metrics()
  if (!keyboard || !Keyboard.isVisible()) return
  view.current?.measureInWindow((_x, y, _width, height) => {
    const overlap = y + height + REVEAL_MARGIN - keyboard.screenY
    if (overlap > 0) scrollBy(overlap)
  })
}

export default function VisitCustomFieldInput({
  def,
  value,
  onChange,
  contactId,
  visitId,
  visitDate,
  scrollBy,
}: {
  def: CustomFieldDefinition
  value: string
  onChange: (value: string) => void
  contactId: string
  visitId: string
  visitDate: Date
  scrollBy: (dy: number) => void
}) {
  const theme = useTheme()
  const visits = useConversations((state) => state.conversations)
  const [focused, setFocused] = useState(false)
  const suggestionsRef = useRef<View>(null)

  useEffect(() => {
    if (!focused) return
    const subscription = Keyboard.addListener('keyboardDidShow', () =>
      revealAboveKeyboard(suggestionsRef, scrollBy)
    )
    return () => subscription.remove()
  }, [focused, scrollBy])

  const valueIndex = useMemo(
    () =>
      focused
        ? customFieldValueIndex(visits, def.id, { excludeVisitId: visitId })
        : null,
    [focused, visits, def.id, visitId]
  )
  const suggestions = valueIndex
    ? customFieldSuggestions(valueIndex, value)
    : []
  const history = useMemo(
    () =>
      contactCustomFieldHistory(visits, {
        contactId,
        fieldId: def.id,
        before: visitDate,
        excludeVisitId: visitId,
      }),
    [visits, contactId, def.id, visitDate, visitId]
  )

  return (
    <View style={{ borderBottomWidth: 1, borderColor: theme.colors.border }}>
      <TextInputRow
        label={def.label}
        controlWidth='full'
        lastInSection
        textInputProps={{
          placeholder: i18n.t('goesHere'),
          onChangeText: onChange,
          onFocus: () => setFocused(true),
          onBlur: () => setFocused(false),
          value,
          autoCapitalize: 'words',
          textAlign: 'start',
        }}
      />
      {suggestions.length > 0 && (
        <View
          ref={suggestionsRef}
          onLayout={() => revealAboveKeyboard(suggestionsRef, scrollBy)}
          style={{ paddingBottom: 8 }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps='handled'
            contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}
          >
            {suggestions.map((suggestion, index) => (
              <Chip
                key={suggestion}
                label={suggestion}
                onPress={() => {
                  onChange(suggestion)
                  analytics.capture('visit_field_suggestion_used', {
                    position: index + 1,
                    filtered: value.trim().length > 0,
                  })
                }}
              />
            ))}
          </ScrollView>
        </View>
      )}
      {history.length > 0 && (
        <Text
          style={{
            paddingHorizontal: 12,
            paddingBottom: 8,
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('visitCustomField_history', { values: history.join(', ') })}
        </Text>
      )}
      <CustomFieldPrivacyWarning texts={[def.label, value]} />
    </View>
  )
}
