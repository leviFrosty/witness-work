import {
  getContactInformationFields,
  hasContactInformationValue,
} from '@/lib/contactInformationFields'
import { usePreferences } from '@/stores/preferences'
import { Mail, MessageCircle, Phone } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { getLocales } from 'expo-localization'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { StyleSheet, View } from 'react-native'
import ContextMenu from '@/components/ui/ContextMenu'
import Copyeable, {
  liftedContent,
  useCopyAction,
} from '@/components/ui/Copyeable'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { openURL } from '@/lib/links'
import { handleCall, handleMessage } from '@/lib/phone'
import useContacts from '@/stores/contactsStore'
import { Contact } from '@/types/contact'
import { RootStackNavigation } from '@/types/rootStack'

/**
 * Mirrors the form: short built-in labels sit beside values; custom labels
 * stack. Tapping a phone number calls and an email opens Mail; long-pressing
 * offers the same actions plus Copy. The inline Call / Message / Email buttons
 * stay beside the value as the visible path, outside the long-press target.
 */
const ContactInformationRows = ({ contact }: { contact: Contact }) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const customFieldDefs = useContacts((state) => state.customFieldDefs)
  const formatted = parsePhoneNumber(contact.phone || '', {
    regionCode: contact.phoneRegionCode || getLocales()[0].regionCode || '',
  })
  const { contactInformationOrder, showContactPhone, showContactEmail } =
    usePreferences()
  const visibleFields = getContactInformationFields(
    customFieldDefs,
    contactInformationOrder,
    {
      phone: showContactPhone,
      email: showContactEmail,
    }
  ).filter((field) => hasContactInformationValue(contact, field))
  const phoneNumber = formatted.number?.international || contact.phone || ''
  const labelStyle = {
    fontSize: 14,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textAlt,
  }
  const copyAction = useCopyAction()
  const call = () => handleCall(contact, formatted, navigation)
  const message = () => handleMessage(contact, formatted, navigation)
  const openMail = () =>
    openURL(`mailTo:${contact.email}`, {
      alert: { description: i18n.t('failedToOpenMailApplication') },
    })

  return (
    <>
      {visibleFields.map((field) => {
        if (field.kind === 'phone')
          return (
            <View key={field.id} style={styles.row}>
              <Text style={[labelStyle, styles.label]}>{i18n.t('phone')}</Text>
              <ContextMenu
                style={[styles.value, liftedContent.outset]}
                analyticsSurface='contact_phone'
                onPress={call}
                accessibilityLabel={phoneNumber}
                actions={[
                  {
                    id: 'call',
                    title: i18n.t('call'),
                    systemImage: 'phone',
                    onPress: call,
                  },
                  {
                    id: 'message',
                    title: i18n.t('message'),
                    systemImage: 'message',
                    onPress: message,
                  },
                  copyAction(phoneNumber),
                ]}
              >
                <Text style={[styles.valueText, liftedContent.inset]}>
                  {phoneNumber}
                </Text>
              </ContextMenu>
              <View style={styles.actions}>
                <IconButton
                  icon={Phone}
                  size={18}
                  color={theme.colors.accent}
                  accessibilityLabel={i18n.t('call')}
                  style={styles.action}
                  hitSlop={0}
                  onPress={call}
                />
                <IconButton
                  icon={MessageCircle}
                  size={18}
                  color={theme.colors.accent}
                  accessibilityLabel={i18n.t('message')}
                  style={styles.action}
                  hitSlop={0}
                  onPress={message}
                />
              </View>
            </View>
          )
        if (field.kind === 'email')
          return (
            <View key={field.id} style={styles.row}>
              <Text style={[labelStyle, styles.label]}>{i18n.t('email')}</Text>
              <ContextMenu
                style={[styles.value, liftedContent.outset]}
                analyticsSurface='contact_email'
                onPress={openMail}
                accessibilityLabel={contact.email}
                actions={[
                  {
                    id: 'email',
                    title: i18n.t('email'),
                    systemImage: 'envelope',
                    onPress: openMail,
                  },
                  copyAction(contact.email ?? ''),
                ]}
              >
                <Text style={[styles.valueText, liftedContent.inset]}>
                  {contact.email}
                </Text>
              </ContextMenu>
              <IconButton
                icon={Mail}
                size={18}
                color={theme.colors.accent}
                accessibilityLabel={i18n.t('email')}
                style={styles.action}
                hitSlop={0}
                onPress={openMail}
              />
            </View>
          )
        if (field.kind !== 'custom') return null
        const definition = field.definition
        return (
          <View style={{ gap: 10 }} key={definition.id}>
            <Text style={labelStyle}>{definition.label}</Text>
            <Copyeable analyticsSurface='contact_custom_field'>
              {contact.customFields![definition.id]}
            </Copyeable>
          </View>
        )
      })}
    </>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: 8,
  },
  label: { flexShrink: 1, maxWidth: '25%' },
  value: { flex: 1, minWidth: 0 },
  valueText: { textAlign: 'right' },
  actions: { flexDirection: 'row' },
  action: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default ContactInformationRows
