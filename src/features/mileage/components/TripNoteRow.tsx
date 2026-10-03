import { useRef } from 'react'
import { TextInput as RNTextInput, View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import TextInput from '@/components/ui/TextInput'

type Props = { value: string; onChangeText: (text: string) => void }

/** Optional free-text note, e.g. a destination or territory. */
export default function TripNoteRow({ value, onChangeText }: Props) {
  const theme = useTheme()
  const input = useRef<RNTextInput>(null)
  return (
    <Section>
      <InputRowContainer
        label={i18n.t('note')}
        lastInSection
        justifyContent='flex-start'
        onLabelPress={() => input.current?.focus()}
        controlWidth='full'
        style={{ gap: 8 }}
      >
        <View style={{ flex: 1, paddingTop: 10 }}>
          <TextInput
            ref={input}
            multiline
            numberOfLines={3}
            maxLength={500}
            style={{
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: theme.numbers.borderRadiusSm,
              paddingVertical: 12,
              paddingHorizontal: 10,
              color: theme.colors.text,
              minHeight: 80,
            }}
            textAlignVertical='top'
            textAlign='left'
            onChangeText={onChangeText}
            value={value}
            placeholder={i18n.t('mileage.notePlaceholder')}
            placeholderTextColor={theme.colors.textAlt}
          />
        </View>
      </InputRowContainer>
    </Section>
  )
}
