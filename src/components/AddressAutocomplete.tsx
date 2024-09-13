import React, { useState, useEffect, useCallback } from 'react'
import { View, TouchableOpacity } from 'react-native'
import axios from 'axios'
import apis from '../constants/apis'
import Text from './MyText'
import useTheme from '../contexts/theme'
import { Address } from '../types/contact'
import i18n from '../lib/locales'
import { FlashList } from '@shopify/flash-list'
import TextInputRow from './inputs/TextInputRow'
import * as Localization from 'expo-localization'
import useLocation from '../hooks/useLocation'

interface AddressAutocompleteProps {
  onSelect: (address: Address) => void
  initialValue?: string
}

interface Suggestion {
  title: string
  highlightedTitle: React.ReactNode
  address: Address
}

const SEARCH_RADIUS = 1000000

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  onSelect,
  initialValue = '',
}) => {
  const [query, setQuery] = useState(initialValue)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const { location } = useLocation()
  const theme = useTheme()

  const createHighlightedTitle = useCallback(
    (title: string, highlights: { start: number; length: number }[]) => {
      console.log('highlights', highlights)
      if (!highlights || highlights.length === 0) {
        return <Text>{title}</Text>
      }
    },
    []
  )

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.length < 3) {
        setSuggestions([])
        return
      }
      console.log('Requesting', query)

      try {
        const hereApiKey = process.env.HERE_API_KEY
        const autocompleteUrl = `${apis.hereAutocomplete}?apiKey=${hereApiKey}&q=${encodeURIComponent(query)}&limit=5&in=${location ? `circle:${location.coords.latitude},${location.coords.longitude};r=${SEARCH_RADIUS}` : `countryCode:${Localization.getLocales()[0].languageCode}`}`
        console.log('queryString', autocompleteUrl)
        const response = await axios.get(autocompleteUrl)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = response.data.items.map((item: any) => {
          console.log('item', item)

          const address: Address = {
            line1: item.address.houseNumber
              ? `${item.address.houseNumber} ${item.address.street}`
              : item.address.street,
            city: item.address.city,
            state: item.address.state,
            zip: item.address.postalCode,
            country: item.address.countryName,
          }

          return {
            title: item.address.label,
            highlightedTitle: createHighlightedTitle(
              item.title,
              item.highlights
            ),
            address,
          }
        })
        setSuggestions(results)
      } catch (error) {
        console.error('Error fetching address suggestions:', error)
      }
    }

    const debounce = setTimeout(fetchSuggestions, 400)
    return () => clearTimeout(debounce)
  }, [createHighlightedTitle, location, query])

  return (
    <View>
      <TextInputRow
        label={i18n.t('search')}
        textInputProps={{
          onChangeText: setQuery,
          placeholder: i18n.t('enterAddress'),
        }}
      />
      <View style={{ minHeight: 2 }}>
        <FlashList
          data={suggestions}
          keyExtractor={(_, index) => index.toString()}
          estimatedItemSize={100}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                console.log('Selected!', item.address)
                setQuery(item.title)
                onSelect(item.address)
                setSuggestions([])
              }}
              style={{
                padding: 10,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <Text>{item.title}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </View>
  )
}

export default AddressAutocomplete
