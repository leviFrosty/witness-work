import { Alert } from 'react-native'
import { buddiesErrorMessage } from '@/features/buddies/lib/buddiesErrors'

/** Says what failed (`title`) and why, for a Buddies action the User took. */
export function alertBuddiesError(title: string, error: unknown) {
  Alert.alert(title, buddiesErrorMessage(error))
}
