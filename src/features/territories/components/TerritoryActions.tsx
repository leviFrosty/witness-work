import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import type { AppIcon } from '@/components/ui/LucideIcon'

export type TerritoryAction = {
  key: string
  icon: AppIcon
  label: string
  sublabel?: string
  onPress: () => void
  testID?: string
}

export default function TerritoryActions({
  actions,
}: {
  actions: (TerritoryAction | false | null | undefined)[]
}) {
  const shown = actions.filter((action): action is TerritoryAction => !!action)
  if (shown.length === 0) return null

  return (
    <Section>
      {shown.map((action, index) => (
        <InputRowButton
          key={action.key}
          testID={action.testID}
          leftIcon={action.icon}
          label={action.label}
          sublabel={action.sublabel}
          onPress={action.onPress}
          lastInSection={index === shown.length - 1}
          style={{ paddingTop: 12, paddingBottom: 12 }}
        />
      ))}
    </Section>
  )
}
