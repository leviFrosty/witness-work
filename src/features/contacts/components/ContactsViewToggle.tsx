import { StyleProp, ViewStyle } from 'react-native'
import i18n from '@/lib/locales'
import { ContactsView } from '@/types/homeStack'
import SegmentedControl from '@/components/ui/SegmentedControl'

/**
 * Labeled List | Map switch under the Contacts title, after search and as tall
 * as it. It sits in the same spot on both workspaces, so the way back is where
 * the way in was.
 */
const ContactsViewToggle = ({
  value,
  onChange,
  disabled,
  style,
}: {
  value: ContactsView
  onChange: (view: ContactsView) => void
  disabled?: boolean
  /** Without it, the switch is as wide as its labels. */
  style?: StyleProp<ViewStyle>
}) => (
  <SegmentedControl<ContactsView>
    variant='pill'
    size='field'
    value={value}
    onChange={onChange}
    disabled={disabled}
    fitContent={style === undefined}
    style={style}
    testID='contacts-view'
    options={[
      {
        key: 'list',
        label: i18n.t('contacts_view_list'),
        testID: 'contacts-view-list',
      },
      { key: 'map', label: i18n.t('map'), testID: 'contacts-view-map' },
    ]}
  />
)

export default ContactsViewToggle
