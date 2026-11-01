import { View } from 'react-native'
import {
  History as HistoryIcon,
  SquarePen as SquarePenIcon,
} from 'lucide-react-native'
import Header from '@/components/ui/layout/Header'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import ScribeUsageMeter from '@/features/scribe/components/ScribeUsageMeter'

const ICON_SIZE = 20

const ICON_GAP = MIN_TOUCH_TARGET - ICON_SIZE

interface Props {
  onHistory: () => void

  onNewConversation?: () => void
}

const ScribeConversationHeader = ({ onHistory, onNewConversation }: Props) => {
  const theme = useTheme()
  return (
    <Header
      buttonType='back'
      title={i18n.t('scribe_name')}
      rightElement={
        <View
          style={{
            position: 'absolute',
            right: 0,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <ScribeUsageMeter />
          <PointerTooltip
            label={i18n.t('scribe_history')}
            effect='none'
            style={{ marginStart: ICON_GAP / 2 }}
          >
            <IconButton
              icon={HistoryIcon}
              size={ICON_SIZE}
              color={theme.colors.text}
              onPress={onHistory}
              accessibilityLabel={i18n.t('scribe_history')}
              frame
            />
          </PointerTooltip>
          {onNewConversation ? (
            <PointerTooltip
              label={i18n.t('scribe_newConversation')}
              effect='none'
              style={{ marginStart: ICON_GAP }}
            >
              <IconButton
                icon={SquarePenIcon}
                size={ICON_SIZE}
                color={theme.colors.text}
                onPress={onNewConversation}
                accessibilityLabel={i18n.t('scribe_newConversation')}
                frame
              />
            </PointerTooltip>
          ) : null}
        </View>
      }
    />
  )
}

export default ScribeConversationHeader
