import { MapPin as MapPinIcon, X as XIcon } from 'lucide-react-native'
import { useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import PlaceSearchInput from '@/components/PlaceSearchInput'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  formatPlanLocation,
  placeSearchProvider,
  toPlanLocation,
} from '@/lib/placeSearch'
import type { PlanLocation } from '@/types/timeEntry'

interface PlaceSearchFieldProps {
  value?: PlanLocation
  onChange: (location?: PlanLocation) => void
  lastInSection?: boolean
}

const SelectedPlace = ({
  location,
  onClear,
}: {
  location: PlanLocation
  onClear: () => void
}) => {
  const theme = useTheme()
  const { primary, secondary } = formatPlanLocation(location)

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <LucideIcon
        icon={MapPinIcon}
        size={theme.fontSize('lg')}
        color={theme.colors.textAlt}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
          }}
        >
          {primary}
        </Text>
        {secondary && (
          <Text
            numberOfLines={2}
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {secondary}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={onClear}
        accessibilityRole='button'
        accessibilityLabel={i18n.t('planLocation_clear')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon
          icon={XIcon}
          size={theme.fontSize('lg')}
          color={theme.colors.textAlt}
        />
      </TouchableOpacity>
    </View>
  )
}

const PlanLocationSearch = ({
  onSelect,
}: {
  onSelect: (location: PlanLocation) => void
}) => {
  const [query, setQuery] = useState('')

  return (
    <PlaceSearchInput
      scope='all'
      query={query}
      onChangeQuery={setQuery}
      onSelect={(place) => {
        onSelect(toPlanLocation(place))
        setQuery('')
      }}
      placeholder={i18n.t('planLocation_placeholder')}
      accessibilityLabel={i18n.t('location')}
    />
  )
}

/**
 * Optional Plan location, searched with Apple MapKit so points of interest
 * ("Kingdom Hall", a park) are found alongside street addresses. Renders
 * nothing on binaries without the native module.
 */
const PlaceSearchField = ({
  value,
  onChange,
  lastInSection,
}: PlaceSearchFieldProps) => {
  if (!placeSearchProvider('all')) return null
  const hasValue = !!value && formatPlanLocation(value).primary !== ''

  return (
    <InputRowContainer
      label={i18n.t('location')}
      lastInSection={lastInSection}
      controlWidth='full'
    >
      {hasValue ? (
        <SelectedPlace location={value} onClear={() => onChange(undefined)} />
      ) : (
        <PlanLocationSearch onSelect={onChange} />
      )}
    </InputRowContainer>
  )
}

export default PlaceSearchField
