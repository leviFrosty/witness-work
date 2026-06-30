import { ActivityIndicator, Image, View } from 'react-native'
import useTheme from '@/contexts/theme'

interface Props {
  working?: boolean
}

/** Branded Scribe AI avatar used by the Notes Import conversation surfaces. */
const NotesImportAvatar = ({ working = false }: Props) => {
  const theme = useTheme()

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        width: 42,
        height: 42,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: theme.colors.accent,
        padding: 2,
        backgroundColor: theme.colors.card,
      }}
    >
      <Image
        source={require('@/assets/icon.png')}
        style={{ width: 34, height: 34, borderRadius: 10 }}
      />
      {working ? (
        <View
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: 20,
            height: 20,
            borderRadius: 10,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.accent,
          }}
        >
          {/* iOS ignores a numeric `size`, rendering the native ~20pt spinner
              that overflowed the badge. Pin to 'small' and scale it down so it
              sits cleanly inside the circle. */}
          <ActivityIndicator
            size='small'
            color={theme.colors.accent}
            style={{ transform: [{ scale: 0.62 }] }}
          />
        </View>
      ) : null}
    </View>
  )
}

export default NotesImportAvatar
