import { useState } from 'react'
import { Modal, Pressable, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { isSafeHref } from '@/lib/richText/parse'

/**
 * What the user typed as a link address, made into one: bare domains get
 * `https://`, `mailto:`/`tel:` stay, anything else (e.g. `javascript:`) is
 * refused.
 */
export function normalizeLinkInput(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
    return isSafeHref(value) ? value : null
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`
  const href = `https://${value.replace(/^\/+/, '')}`
  return isSafeHref(href) && /\.[a-z]{2,}(?:[/?#:]|$)/i.test(href) ? href : null
}

/**
 * Adds or changes the link at the cursor. Asks for the link's text too when
 * nothing is selected, so a link can be inserted without typing it out first.
 * Closing the sheet (tapping outside or Back) cancels.
 */
const LinkSheet = (props: {
  currentHref: string | null
  /** Selected text; a URL-looking selection prefills the address. */
  selection: string
  onSave: (href: string, text?: string) => void
  onRemove: () => void
  onClose: () => void
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const selectionIsUrl =
    !!normalizeLinkInput(props.selection) && !/\s/.test(props.selection.trim())
  const [address, setAddress] = useState(
    props.currentHref ?? (selectionIsUrl ? props.selection.trim() : '')
  )
  const [text, setText] = useState('')
  const [error, setError] = useState(false)
  const asksForText = !props.currentHref && !props.selection

  const save = () => {
    const href = normalizeLinkInput(address)
    if (!href) {
      setError(true)
      return
    }
    props.onSave(href, asksForText ? text : undefined)
  }

  return (
    <Modal
      visible
      transparent
      animationType='fade'
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        behavior='padding'
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
          onPress={props.onClose}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('close')}
        />
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderTopLeftRadius: theme.numbers.borderRadiusLg,
            borderTopRightRadius: theme.numbers.borderRadiusLg,
            padding: 20,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
            gap: 12,
          }}
        >
          <Text
            accessibilityRole='header'
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.bold,
            }}
          >
            {i18n.t('richText_link')}
          </Text>
          <TextInput
            autoFocus
            value={address}
            onChangeText={(value) => {
              setAddress(value)
              setError(false)
            }}
            placeholder={i18n.t('richText_linkAddressPlaceholder')}
            accessibilityLabel={i18n.t('richText_linkAddress')}
            keyboardType='url'
            autoCapitalize='none'
            autoCorrect={false}
            textContentType='URL'
            returnKeyType={asksForText ? 'next' : 'done'}
            onSubmitEditing={asksForText ? undefined : save}
            error={error ? i18n.t('richText_linkInvalid') : undefined}
            testID='note-link-address'
          />
          {asksForText && (
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={i18n.t('richText_linkTextPlaceholder')}
              accessibilityLabel={i18n.t('richText_linkText')}
              returnKeyType='done'
              onSubmitEditing={save}
              testID='note-link-text'
            />
          )}
          <ActionButton onPress={save} testID='note-link-save'>
            {i18n.t('save')}
          </ActionButton>
          {props.currentHref && (
            <Button
              onPress={props.onRemove}
              accessibilityRole='button'
              style={{ alignItems: 'center', paddingVertical: 8 }}
              testID='note-link-remove'
            >
              <Text style={{ color: theme.colors.error }}>
                {i18n.t('richText_removeLink')}
              </Text>
            </Button>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

export default LinkSheet
