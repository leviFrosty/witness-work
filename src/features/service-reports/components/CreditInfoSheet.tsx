import { X as XIcon } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'
import { Sheet } from 'tamagui'
import Chip from '@/components/ui/Chip'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'

type Props = {
  creditOverageMinutes: number
}

const CreditInfoSheet = ({ creditOverageMinutes }: Props) => {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const overageDisplay = useFormattedMinutes(creditOverageMinutes)

  if (creditOverageMinutes <= 0) return null

  return (
    <>
      <Chip
        label={i18n.t('creditOverageChip', { value: overageDisplay.formatted })}
        tone='warn'
        onPress={() => setOpen(true)}
      />
      <Sheet
        open={open}
        onOpenChange={setOpen}
        dismissOnSnapToBottom
        modal
        snapPoints={[45]}
      >
        <Sheet.Handle />
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame>
          <View
            style={{
              padding: 25,
              gap: 15,
              flex: 1,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('xl'),
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('aboutCreditCap')}
              </Text>
              <IconButton
                noTransform
                icon={XIcon}
                onPress={() => setOpen(false)}
              />
            </View>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('md'),
                lineHeight: 22,
              }}
            >
              {i18n.t('aboutCreditCap_description')}
            </Text>
          </View>
        </Sheet.Frame>
      </Sheet>
    </>
  )
}

export default CreditInfoSheet
