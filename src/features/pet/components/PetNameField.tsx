import { useState } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { cssColor, type GamePalette } from '@/features/pet/art/gameUi'
import { GameFrame, gamePixelScale } from '@/features/pet/components/GamePixels'

/**
 * The optional name, with the species name as its placeholder, on a paper field
 * framed in the accent while typing.
 */
export default function PetNameField({
  value,
  onChangeText,
  placeholder,
  maxLength,
  autoFocus,
  onSubmitEditing,
  palette,
}: {
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  maxLength: number
  autoFocus?: boolean
  onSubmitEditing?: () => void
  palette: GamePalette
}) {
  const theme = useTheme()
  const scale = gamePixelScale()
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: palette.inkAlt,
        }}
      >
        {i18n.t('pet.picker.nameLabel')}
      </Text>
      <GameFrame
        kind={focused ? 'fieldFocused' : 'field'}
        palette={palette}
        style={{ padding: 2 * scale }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.inkAlt}
          selectionColor={cssColor(palette.accent)}
          maxLength={maxLength}
          textAlign='start'
          autoCapitalize='words'
          autoCorrect={false}
          returnKeyType='done'
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={i18n.t('pet.picker.nameLabel')}
          style={{
            backgroundColor: 'transparent',
            borderWidth: 0,
            paddingHorizontal: 10,
            minHeight: 44,
            fontSize: theme.fontSize('md'),
            color: palette.ink,
          }}
        />
      </GameFrame>
    </View>
  )
}
