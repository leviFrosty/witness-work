import { useState } from 'react'
import { View } from 'react-native'
import { Sheet } from 'tamagui'
import Text from './MyText'
import Button from './Button'
import IconButton from './IconButton'
import CategorySegmentBar, { CategorySegment } from './CategorySegmentBar'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import { faChevronRight, faTimes } from '@fortawesome/free-solid-svg-icons'

type Props = {
  segments: CategorySegment[]
}

const CategoriesSection = ({ segments }: Props) => {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const visible = segments.filter((s) => s.minutes > 0)
  if (visible.length === 0) return null

  return (
    <>
      <Button onPress={() => setOpen(true)} noTransform>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {i18n.t('categories')}
          </Text>
          <IconButton
            icon={faChevronRight}
            size={12}
            iconStyle={{ color: theme.colors.textAlt }}
          />
        </View>
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        dismissOnSnapToBottom
        modal
        snapPoints={[70]}
      >
        <Sheet.Handle />
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame>
          <View
            style={{
              padding: 25,
              gap: 20,
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
                {i18n.t('categoryBreakdown')}
              </Text>
              <IconButton icon={faTimes} onPress={() => setOpen(false)} />
            </View>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('categoryBreakdown_description')}
            </Text>
            <CategorySegmentBar segments={segments} />
          </View>
        </Sheet.Frame>
      </Sheet>
    </>
  )
}

export default CategoriesSection
