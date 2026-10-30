import { View } from 'react-native'
import { CircleCheck as CircleCheckIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Text from '@/components/ui/MyText'
import { RecoveryKeyContent } from '@/features/settings/components/account/RecoveryKeySheet'
import i18n from '@/lib/locales'

/**
 * Step 2: the new recovery key, with Copy and Share, and "I've saved it" before
 * the key can change.
 */
export default function KeyChangeNewKey({
  recoveryKey,
  saved,
  onSavedChange,
  onChange,
}: {
  recoveryKey: string
  saved: boolean
  onSavedChange: (saved: boolean) => void
  onChange: () => void
}) {
  return (
    <View style={{ gap: 16 }} testID='key-change-new-key'>
      <RecoveryKeyContent
        recoveryKey={recoveryKey}
        title={i18n.t('accountKeyChange_newKeyTitle')}
        padding={0}
      />
      <Text>{i18n.t('accountKeyChange_newKeyBody')}</Text>
      <Section>
        <InputRowSwitch
          leftIcon={CircleCheckIcon}
          label={i18n.t('accountKeyChange_saved')}
          value={saved}
          onValueChange={onSavedChange}
          lastInSection
        />
      </Section>
      <ActionButton
        onPress={onChange}
        disabled={!saved}
        testID='key-change-confirm'
      >
        {i18n.t('accountKeyChange_start')}
      </ActionButton>
    </View>
  )
}
