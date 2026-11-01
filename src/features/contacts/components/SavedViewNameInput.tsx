import useFormValidation from '@/hooks/useFormValidation'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import type { InputRef } from 'tamagui'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import ActionButton from '@/components/ui/ActionButton'
import MyTextInput from '@/components/ui/TextInput'
import Text from '@/components/ui/MyText'
import CustomFieldPrivacyWarning from '@/components/CustomFieldPrivacyWarning'
import {
  SAVED_VIEW_NAME_MAX_LENGTH,
  normalizeSavedViewName,
} from '@/features/contacts/lib/savedViews'

const SavedViewNameInput = ({ onSave }: { onSave: (name: string) => void }) => {
  const theme = useTheme()
  const [name, setName] = useState('')
  const canSave = normalizeSavedViewName(name).length > 0
  const validation = useFormValidation({ name: !canSave }, 'saved_view')
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  const save = () => {
    if (validation.validate()) onSave(name)
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <MyTextInput
          ref={inputRef}
          invalid={validation.invalid('name')}
          value={name}
          onChangeText={setName}
          onSubmitEditing={save}
          placeholder={i18n.t('savedViews_namePlaceholder')}
          maxLength={SAVED_VIEW_NAME_MAX_LENGTH}
          autoCapitalize='sentences'
          enterKeyHint='done'
          textAlign='start'
          style={{ flex: 1 }}
        />
        <ActionButton onPress={save}>
          <Text
            style={{
              color: theme.colors.textInverse,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t('save')}
          </Text>
        </ActionButton>
      </View>
      <CustomFieldPrivacyWarning texts={[name]} />
    </View>
  )
}

export default SavedViewNameInput
