import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { hasSensitiveCustomFieldText } from '@/features/contacts/lib/sensitiveCustomFields'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'

/** Advisory only: never changes input values or whether the user can save. */
export default function CustomFieldPrivacyWarning({
  texts,
}: {
  texts: string[]
}) {
  const theme = useTheme()
  const enabled = usePreferences((state) => state.dataProtectionMode)
  if (!enabled || !texts.some(hasSensitiveCustomFieldText)) return null

  return (
    <Text
      accessibilityLiveRegion='polite'
      style={{
        paddingHorizontal: 12,
        paddingBottom: 8,
        fontSize: theme.fontSize('sm'),
        color: theme.colors.textAlt,
      }}
    >
      {i18n.t('dataProtectionNoteHint')}
    </Text>
  )
}
