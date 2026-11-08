import type { ReactNode } from 'react'
import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'

export default function SettingsGroup({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <View>
      {title && <SectionTitle text={title} />}
      <Section>{children}</Section>
    </View>
  )
}
