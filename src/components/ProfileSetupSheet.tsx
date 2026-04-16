import { Sheet } from 'tamagui'
import { View } from 'react-native'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import Text from './MyText'
import IconButton from './IconButton'
import ActionButton from './ActionButton'
import ProfileSetupForm from './ProfileSetupForm'
import ProfileCard from './ProfileCard'
import i18n from '../lib/locales'
import { usePreferences } from '../stores/preferences'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
}

const ProfileSetupSheet = ({ open, setOpen }: Props) => {
  const theme = useTheme()
  const { set } = usePreferences()

  const handleSave = () => {
    set({ hasCompletedProfileSetup: true })
    setOpen(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      dismissOnSnapToBottom
      modal
      snapPoints={[85]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View style={{ padding: 30, gap: 20 }}>
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
                color: theme.colors.text,
              }}
            >
              {i18n.t('profileSetupTitle')}
            </Text>
            <IconButton
              icon={faTimes}
              size='xl'
              onPress={() => setOpen(false)}
            />
          </View>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {i18n.t('profileSetupDesc')}
          </Text>
          <ProfileSetupForm />
          <View style={{ gap: 8 }}>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {i18n.t('profileSetupPreviewLabel')}
            </Text>
            <ProfileCard preview />
          </View>
          <ActionButton onPress={handleSave}>{i18n.t('save')}</ActionButton>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default ProfileSetupSheet
