import { useState } from 'react'
import { View } from 'react-native'
import { Sheet } from 'tamagui'
import _ from 'lodash'
import Chip from '@/components/Chip'
import Text from '@/components/MyText'
import IconButton from '@/components/IconButton'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

type Props = {
  creditOverageMinutes: number
}

const CreditInfoSheet = ({ creditOverageMinutes }: Props) => {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const overageHours = _.round(creditOverageMinutes / 60, 1)

  if (creditOverageMinutes <= 0) return null

  return (
    <>
      <Chip
        label={i18n.t('creditOverageChip', { count: overageHours })}
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
                icon={faTimes}
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
