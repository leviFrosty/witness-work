import { useRef } from 'react'
import { ScrollView, View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import confirmDestructive from '@/lib/confirmDestructive'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import { SCRIBE_MEMORY_MAX_CHARS } from '@/features/scribe/lib/memory'
import {
  setScribeMemoryEnabled,
  setScribeMemoryText,
  useScribeMemory,
} from '@/features/scribe/stores/memory'
import { trackMemoryManaged } from '@/features/scribe/analytics'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

const ScribeMemoryScreen = () => {
  const foldColumn = useFoldColumn(640)
  const theme = useTheme()
  const enabled = useScribeMemory((s) => s.enabled)
  const text = useScribeMemory((s) => s.text)

  const editingFrom = useRef<string | null>(null)

  const toggle = (value: boolean) => {
    setScribeMemoryEnabled(value)
    trackMemoryManaged(value ? 'turned_on' : 'turned_off', text.length)
  }

  const clear = () =>
    confirmDestructive({
      title: i18n.t('scribe_memoryClearConfirm'),
      confirmLabel: i18n.t('scribe_memoryClear'),
      onConfirm: () => {
        trackMemoryManaged('cleared', text.length)
        setScribeMemoryText('')
      },
    })

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 20 }}
      keyboardShouldPersistTaps='handled'
      keyboardDismissMode='interactive'
    >
      {}
      <View
        style={[
          { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 },
          foldColumn,
        ]}
      >
        <Section>
          <InputRowSwitch
            label={i18n.t('scribe_memoryToggle')}
            info={i18n.t('scribe_memoryInfoBody')}
            value={enabled}
            onValueChange={toggle}
            lastInSection
          />
        </Section>
        {enabled ? null : (
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              paddingHorizontal: 4,
            }}
          >
            {i18n.t('scribe_memoryOffNote')}
          </Text>
        )}

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingHorizontal: 4,
            marginTop: 12,
          }}
        >
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('scribe_memoryNotesLabel')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              fontVariant: ['tabular-nums'],
            }}
          >
            {i18n.t('scribe_memoryCount', {
              used: formatNumber(text.length),
              max: formatNumber(SCRIBE_MEMORY_MAX_CHARS),
            })}
          </Text>
        </View>
        <TextInput
          multiline
          value={text}
          onChangeText={(value) => setScribeMemoryText(value)}
          onFocus={() => {
            editingFrom.current = text
          }}
          onBlur={() => {
            if (editingFrom.current !== null && editingFrom.current !== text)
              trackMemoryManaged('edited', text.length)
            editingFrom.current = null
          }}
          maxLength={SCRIBE_MEMORY_MAX_CHARS}
          placeholder={i18n.t('scribe_memoryPlaceholder')}
          accessibilityLabel={i18n.t('scribe_memoryTitle')}
          textAlign='start'
          textAlignVertical='top'
          style={{ minHeight: 200, fontSize: theme.fontSize('md') }}
          testID='scribe-memory-text'
        />

        {text.trim() ? (
          <Button
            noTransform
            onPress={clear}
            style={{
              alignSelf: 'flex-start',
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: 4,
              marginTop: 8,
            }}
            testID='scribe-memory-clear'
          >
            <Text
              style={{
                fontSize: theme.fontSize('md'),
                color: theme.colors.error,
              }}
            >
              {i18n.t('scribe_memoryClear')}
            </Text>
          </Button>
        ) : null}
      </View>
    </ScrollView>
  )
}

export default ScribeMemoryScreen
