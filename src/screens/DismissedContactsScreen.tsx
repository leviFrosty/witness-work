import React, { useMemo } from 'react'
import { View, Alert } from 'react-native'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Wrapper from '../components/layout/Wrapper'
import Text from '../components/MyText'
import Card from '../components/Card'
import useTheme from '../contexts/theme'
import useContacts from '../stores/contactsStore'
import { getDismissedContacts } from '../lib/dismissedContacts'
import { FlashList } from '@shopify/flash-list'
import { RootStackParamList } from '../types/rootStack'
import i18n from '../lib/locales'
import moment from 'moment'
import IconButton from '../components/IconButton'
import { faUndo } from '@fortawesome/free-solid-svg-icons'
import { Contact } from '../types/contact'
import { useToastController } from '@tamagui/toast'

type Props = NativeStackScreenProps<RootStackParamList, 'Dismissed Contacts'>

const DismissedContactRow = ({ contact }: { contact: Contact }) => {
  const theme = useTheme()
  const { undismissContact } = useContacts()
  const toast = useToastController()

  const handleUndismiss = () => {
    Alert.alert(
      i18n.t('undismissContact', { name: contact.name }),
      i18n.t('undismissContactDescription'),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel',
        },
        {
          text: i18n.t('undismiss'),
          onPress: () => {
            undismissContact(contact.id)
            toast.show(i18n.t('contactUndismissed', { name: contact.name }), {
              native: true,
            })
          },
        },
      ]
    )
  }

  return (
    <Card
      style={{
        paddingHorizontal: 18,
        paddingVertical: 16,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row' }}>
        <View style={{ flexGrow: 1, gap: 4 }}>
          <Text style={{ fontSize: 18 }}>{contact.name}</Text>
          <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            {contact.dismissedUntil
              ? i18n.t('dismissedUntil', {
                  date: moment(contact.dismissedUntil).format('MMM D, YYYY'),
                })
              : ''}
          </Text>
        </View>
        <IconButton
          onPress={handleUndismiss}
          icon={faUndo}
          size='lg'
          style={{
            backgroundColor: theme.colors.accentTranslucent,
            padding: 12,
            borderRadius: theme.numbers.borderRadiusSm,
            borderWidth: 1,
            borderColor: theme.colors.accent,
          }}
          color={theme.colors.accent}
        />
      </View>
    </Card>
  )
}

const DismissedContactsScreen: React.FC<Props> = ({ navigation }) => {
  const theme = useTheme()
  const { contacts } = useContacts()

  const dismissedContacts = useMemo(() => {
    return getDismissedContacts(contacts).sort((a, b) => {
      // Sort by dismissed until date, earliest first
      if (!a.dismissedUntil) return 1
      if (!b.dismissedUntil) return -1
      return moment(a.dismissedUntil).unix() - moment(b.dismissedUntil).unix()
    })
  }, [contacts])

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: i18n.t('dismissedContacts'),
    })
  }, [navigation])

  return (
    <Wrapper>
      <View style={{ flex: 1, gap: 20 }}>
        <View style={{ gap: 10 }}>
          <Text
            style={{
              fontSize: theme.fontSize('xl'),
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
            }}
          >
            {i18n.t('dismissedContacts')}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
              lineHeight: 20,
            }}
          >
            {i18n.t('dismissedContactsHelp')}
          </Text>
        </View>

        {dismissedContacts.length === 0 ? (
          <Card>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                textAlign: 'center',
                paddingVertical: 40,
                lineHeight: 20,
              }}
            >
              {i18n.t('noDismissedContacts')}
            </Text>
          </Card>
        ) : (
          <Card style={{ flex: 1 }}>
            <FlashList
              data={dismissedContacts}
              renderItem={({ item }) => (
                <DismissedContactRow key={item.id} contact={item} />
              )}
              estimatedItemSize={84}
              ItemSeparatorComponent={() => <View style={{ marginTop: 12 }} />}
            />
          </Card>
        )}
      </View>
    </Wrapper>
  )
}

export default DismissedContactsScreen
