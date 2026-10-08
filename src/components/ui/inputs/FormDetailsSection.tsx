import { ReactNode } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import Section from '@/components/ui/inputs/Section'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/** The "Details" list of a docked form: optional rows above its dock. */
const FormDetailsSection = (props: { children: ReactNode }) => {
  const theme = useTheme()
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          paddingHorizontal: 4,
        }}
      >
        {i18n.t('formDetails')}
      </Text>
      <Section>{props.children}</Section>
    </View>
  )
}

export default FormDetailsSection
