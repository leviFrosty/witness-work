import { NativeStackScreenProps } from '@react-navigation/native-stack'
import ContactDetailsContent from '@/features/contacts/components/ContactDetailsContent'
import { RootStackParamList } from '@/types/rootStack'

const ContactDetailsScreen = ({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Contact Details'>) => (
  <ContactDetailsContent {...route.params} navigation={navigation} />
)

export default ContactDetailsScreen
