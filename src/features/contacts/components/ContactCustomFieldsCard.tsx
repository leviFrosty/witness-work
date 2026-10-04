import { View } from 'react-native'
import Copyeable from '@/components/ui/Copyeable'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import {
  getContactInformationFields,
  hasContactInformationValue,
} from '@/lib/contactInformationFields'
import { usePreferences } from '@/stores/preferences'
import useContacts from '@/stores/contactsStore'
import { Contact } from '@/types/contact'

const WIDE_LABEL = 22
const WIDE_VALUE = 36

/**
 * The contact's custom fields in a two-column grid, in the user's field order.
 * Long labels or values get a full row instead of a cramped half cell. Renders
 * nothing when the contact has no custom field values.
 */
const ContactCustomFieldsCard = ({ contact }: { contact: Contact }) => {
  const theme = useTheme()
  const customFieldDefs = useContacts((state) => state.customFieldDefs)
  const { contactInformationOrder } = usePreferences()
  const definitions = getContactInformationFields(
    customFieldDefs,
    contactInformationOrder,
    { phone: false, email: false }
  )
    .filter((field) => hasContactInformationValue(contact, field))
    .flatMap((field) => (field.kind === 'custom' ? [field.definition] : []))

  if (definitions.length === 0) return null

  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.numbers.borderRadiusLg,
        padding: 16,
        flexDirection: 'row',
        flexWrap: 'wrap',
        rowGap: 14,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      {definitions.map((definition) => {
        const value = contact.customFields?.[definition.id] ?? ''
        const wide =
          definition.label.length > WIDE_LABEL || value.length > WIDE_VALUE
        return (
          <View
            key={definition.id}
            style={{ width: wide ? '100%' : '50%', paddingRight: 16, gap: 2 }}
          >
            <Text
              style={{
                fontSize: theme.fontSize('xs') + 1,
                fontFamily: theme.fonts.semiBold,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                color: theme.colors.textAlt,
              }}
            >
              {definition.label}
            </Text>
            <Copyeable
              textProps={{
                style: {
                  fontSize: theme.fontSize('md') + 0.5,
                  fontFamily: theme.fonts.medium,
                },
              }}
            >
              {value}
            </Copyeable>
          </View>
        )
      })}
    </View>
  )
}

export default ContactCustomFieldsCard
