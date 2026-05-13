import { Platform, Switch, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { faChevronRight, faIcons } from '@fortawesome/free-solid-svg-icons'
import { useContext } from 'react'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import IconButton from '@/components/ui/IconButton'
import AccentColorPicker from '@/components/AccentColorPicker'
import Divider from '@/components/ui/Divider'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { ThemeContext } from '@/contexts/theme'
import { RootStackNavigation } from '@/types/rootStack'

const ProfileCardShaderToggle = () => {
  const { profileCardShaderEnabled, set } = usePreferences()
  const theme = useContext(ThemeContext)

  return (
    <InputRowContainer
      lastInSection
      style={{
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-start',
      }}
    >
      <View
        style={{
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('profileCardShader')}
        </Text>
        <Switch
          value={profileCardShaderEnabled}
          onValueChange={(value) => set({ profileCardShaderEnabled: value })}
        />
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('xs'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('profileCardShader_description')}
      </Text>
    </InputRowContainer>
  )
}

const PersonalizationPreferencesSection = () => {
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <View style={{ gap: 3 }}>
      <Section style={{ paddingLeft: 20, paddingRight: 20 }} noPadding>
        <AccentColorPicker />
      </Section>
      {Platform.OS === 'ios' && (
        <>
          <Divider marginVertical={20} />
          <Section>
            <InputRowButton
              leftIcon={faIcons}
              label={i18n.t('appIconScreenTitle')}
              onPress={() => navigation.navigate('PreferencesAppIcon')}
              lastInSection
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
          </Section>
        </>
      )}
      {__DEV__ && (
        <>
          <Divider marginVertical={20} />
          <Section>
            <ProfileCardShaderToggle />
          </Section>
        </>
      )}
    </View>
  )
}

export default PersonalizationPreferencesSection
