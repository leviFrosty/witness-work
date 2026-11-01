import { useEffect } from 'react'
import { View } from 'react-native'
import { X as XIcon } from 'lucide-react-native'
import Sheet from '@/components/ui/Sheet'
import IconButton from '@/components/ui/IconButton'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import i18n from '@/lib/locales'
import { trackPrivacyViewed } from '@/features/scribe/analytics'
import ScribeZeroDataRetentionDetails, {
  ScribeZeroDataRetentionHeading,
} from '@/features/scribe/components/ScribeZeroDataRetentionDetails'

type Props = {
  open: boolean
  setOpen: (open: boolean) => void
}

const ScribeZeroDataRetentionSheet = ({ open, setOpen }: Props) => {
  useEffect(() => {
    if (open) trackPrivacyViewed('settings')
  }, [open])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Sheet.ScrollView
        contentContainerStyle={{
          width: '100%',
          maxWidth: inputLayout.contentMaxWidth,
          alignSelf: 'center',
          padding: 24,
          paddingBottom: 32,
          gap: 20,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <ScribeZeroDataRetentionHeading />
          <IconButton
            noTransform
            icon={XIcon}
            size='xl'
            onPress={() => setOpen(false)}
            accessibilityLabel={i18n.t('close')}
          />
        </View>
        <ScribeZeroDataRetentionDetails />
      </Sheet.ScrollView>
    </Sheet>
  )
}

export default ScribeZeroDataRetentionSheet
