import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import Text from '../components/MyText'
import ActionButton from '../components/ActionButton'
import IconButton from '../components/IconButton'
import ProfileCard from '../components/ProfileCard'
import DateTimePicker from '../components/DateTimePicker'
import i18n from '../lib/locales'
import { usePreferences } from '../stores/preferences'
import { getStartDateLabels } from '../constants/publisher'
import usePublisher from '../hooks/usePublisher'
import { RootStackNavigation } from '../types/rootStack'

const ProfileSetupScreen = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { publisher, pioneerStartDate, hasCompletedProfileSetup, set } =
    usePreferences()
  const { tracksPioneerStartDate } = usePublisher()
  const isEditing = hasCompletedProfileSetup

  const handleSave = () => {
    set({ hasCompletedProfileSetup: true })
    navigation.goBack()
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          right: 12,
          zIndex: 1,
        }}
      >
        <IconButton
          icon={faTimes}
          size='xl'
          onPress={() => navigation.goBack()}
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 24,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
      >
        <View style={{ gap: 6 }}>
          <Text
            style={{
              fontSize: theme.fontSize('2xl'),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
            }}
          >
            {i18n.t(isEditing ? 'profileEditTitle' : 'profileSetupTitle')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {i18n.t(isEditing ? 'profileEditDesc' : 'profileSetupDesc')}
          </Text>
        </View>

        <ProfileCard editable />

        {tracksPioneerStartDate && (
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {i18n.t(getStartDateLabels(publisher).label)}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
                marginBottom: 4,
              }}
            >
              {i18n.t(getStartDateLabels(publisher).description)}
            </Text>
            <DateTimePicker
              value={pioneerStartDate ? new Date(pioneerStartDate) : new Date()}
              onChange={(_e, date) => {
                if (date) set({ pioneerStartDate: date })
              }}
              maximumDate={new Date()}
              iOSMode='date'
            />
          </View>
        )}
      </ScrollView>
      <View
        style={{
          padding: 24,
          paddingBottom: insets.bottom + 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        }}
      >
        <ActionButton onPress={handleSave}>{i18n.t('save')}</ActionButton>
      </View>
    </View>
  )
}

export default ProfileSetupScreen
