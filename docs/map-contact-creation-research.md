# Create a contact from a map location

Date: 2026-09-23. First-party documentation review; application behavior below was not independently tested on devices.

## Examples

| Application           | Documented interaction                                                                                                                                 | Useful precedent                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Maps on iPhone  | Touch and hold the map to drop a pin. The place card exposes actions, and Move lets the user refine the point. Only one unsaved pin appears at a time. | Show the chosen point before committing; keep temporary selection separate from saved places. [Apple guide](https://support.apple.com/en-euro/guide/iphone/iphfa7286b57/ios)           |
| Google Maps on iPhone | Touch and hold an unlabeled area to drop a red pin. Its place sheet contains the coordinates.                                                          | A geographic point is useful even without a known street address. [Google Maps help](https://support.google.com/maps/answer/18539?co=GENIE.Platform%3DiOS&hl=en)                       |
| OsmAnd on iOS         | Long tap a precise point to open its context panel; Add opens favorite creation. Tapping an empty map area or dragging the panel down dismisses it.    | Selecting a location and creating a saved object are separate steps, with lightweight dismissal. [OsmAnd guide](https://www.osmand.net/docs/user/map/map-context-menu/?current-os=ios) |

## Recommendation for WitnessWork

Use one temporary pin with a compact action card containing **Create contact** and **Cancel**. Keep the map visible so the user can verify the location. This combines the pin-and-card precedent with WitnessWork's existing contact cards; a fixed card also gives the actions predictable space near screen edges. These are design recommendations inferred from the examples, not claims that each application implements the same details.

1. **Press and hold:** Place the temporary pin immediately at the gesture's coordinates. Give light haptic feedback and dismiss the search keyboard. Suspend current-location following and center the chosen point without changing zoom so the card cannot cover it.
2. **Review:** Show a short location-selected title and the two actions. Display the card in the map's available area, respecting the tab bar, safe area, and wide-layout inspector. Keep the temporary pin visually distinct from Contact Markers, whose colors communicate Visit recency.
3. **Create contact:** Open the existing Contact Form with the exact latitude and longitude prefilled as a manually chosen location. Keep full numeric precision in state and navigation. A displayed rounded coordinate must not become the saved value. Save remains the action that creates the Contact.
4. **Cancel:** Remove the temporary pin and card without creating a Contact. Tapping an empty map area can perform the same dismissal. A subsequent long press replaces the selection; opening an existing Contact or leaving the map clears it.
5. **Form behavior:** Skip the previous Contact's address prefill for this entry point. Keep the selected coordinates through Save unless the user explicitly changes them. Coordinate-only creation must work without reverse geocoding, a network request, or current-location permission.
6. **Return to the map:** After the forms and Contact Details close, select the created Contact in the carousel (or wide-layout inspector), clear the previous map search, and center its saved pin. Use the saved coordinates so any edits made in the forms carry through. Abandoning creation preserves the previous search and selection.

The explicit Cancel action belongs to this temporary map selection card. The Contact Form retains its existing dismissal behavior, consistent with the repository's sheet guardrail.

## Implementation and validation notes

`react-native-maps` supplies `onLongPress` with `nativeEvent.coordinate` and `nativeEvent.position`; use the former directly instead of calculating a location from screen pixels. Its separate marker-drag events should continue handling existing Contact Markers. [Official component API](https://github.com/react-native-maps/react-native-maps/blob/master/docs/mapview.md#events)

The existing [Contact Form](../src/features/contacts/screens/ContactFormScreen.tsx) already distinguishes manually chosen coordinates with `userDraggedCoordinate`; initialize that state for map creation. The [Map screen](../src/features/map/screens/MapScreen.tsx) already has a contact carousel and a wide-layout inspector, so transient selection should coexist with both without triggering their automatic recentering.

Validate long press, replacement, Cancel, empty-map dismissal, contact selection, navigation away, creation, and return after abandoning the form. Check that Save preserves the exact point, that existing marker dragging still works, and that the pin stays visible in narrow and wide layouts. Include coordinates on the equator and prime meridian: numeric zero is valid, not a missing location. Localize new copy in `en-US.json`; other locales require human approval.
