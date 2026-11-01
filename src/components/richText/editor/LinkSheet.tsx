import { useEffect, useRef, useState } from 'react'
import { Platform, TextInput as RNTextInput, View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { isSafeHref } from '@/lib/richText/parse'

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

type LinkSheetProps = {
  open: boolean
  currentHref: string | null

  selection: string
  onSave: (href: string, text?: string) => void
  onRemove: () => void
  onClose: () => void
}

const LinkSheet = (props: LinkSheetProps) => {
  const theme = useTheme()
  return (
    <Sheet
      open={props.open}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      backgroundColor={theme.colors.card}
    >
      <LinkForm {...props} />
    </Sheet>
  )
}

const LinkForm = (props: LinkSheetProps) => {
  const theme = useTheme()
  const selectionIsUrl =
    !!normalizeLinkInput(props.selection) && !/\s/.test(props.selection.trim())
  const [address, setAddress] = useState(
    props.currentHref ?? (selectionIsUrl ? props.selection.trim() : '')
  )
  const [text, setText] = useState('')
  const [error, setError] = useState(false)
  const asksForText = !props.currentHref && !props.selection
  const addressInput = useRef<RNTextInput>(null)

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const timer = setTimeout(() => addressInput.current?.focus(), 300)
    return () => clearTimeout(timer)
  }, [])

  const save = () => {
    const href = normalizeLinkInput(address)
    if (!href) {
      setError(true)
      return
    }
    props.onSave(href, asksForText ? text : undefined)
  }

  return (
    <View style={{ padding: 20, gap: 12 }}>
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
        ref={addressInput}
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
  )
}

export default LinkSheet
