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

/**
 * Inline name field for a new Saved View. Leaving it empty (blur) dismisses it,
 * so there's no Cancel button — the sheet itself can be dismissed too.
 */
const SavedViewNameInput = ({
  onSave,
  onDismiss,
}: {
  onSave: (name: string) => void
  onDismiss: () => void
}) => {
  const theme = useTheme()
  const [name, setName] = useState('')
  const canSave = normalizeSavedViewName(name).length > 0
  const inputRef = useRef<InputRef>(null)

  // `autoFocus` doesn't take inside the native form sheet; focus once mounted.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  const save = () => {
    if (canSave) onSave(name)
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <MyTextInput
          ref={inputRef}
          value={name}
          onChangeText={setName}
          onSubmitEditing={save}
          onBlur={() => {
            if (!canSave) onDismiss()
          }}
          placeholder={i18n.t('savedViews_namePlaceholder')}
          maxLength={SAVED_VIEW_NAME_MAX_LENGTH}
          autoCapitalize='sentences'
          enterKeyHint='done'
          textAlign='left'
          style={{ flex: 1 }}
        />
        <ActionButton disabled={!canSave} onPress={save}>
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
