export type Address = {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export type Coordinate = {
  latitude: number
  longitude: number
}

export type Contact = {
  id: string
  name: string
  phone?: string

  /**
   * If the phone number is on national form, this region code specifies the
   * region of the phone number, e.g. "SE" for Sweden.
   */
  phoneRegionCode?: string
  email?: string
  address?: Address

  /**
   * Used primarily for map markers.
   *
   * This may not always accurate as it uses a user input address as the search
   * query to determine coordinate.
   *
   * Coordinate is fetched as geocode from address from Here api:
   * https://www.here.com/docs/bundle/geocoding-and-search-api-v7-api-reference/page/index.html#/paths/~1geocode/get
   */
  coordinate?: Coordinate
  /**
   * The user manually updated the coordinate by dragging it. This should cause
   * the coordinate to take precedent over the address.
   */
  userDraggedCoordinate?: boolean
  createdAt: Date
  customFields?: Record<string, string>

  /**
   * When set, this contact is dismissed and should be hidden from the main
   * contact list and map until the dismissedUntil date has passed.
   */
  dismissedUntil?: Date

  /**
   * Notification ID for the scheduled notification to remind the user when the
   * contact becomes available again after being dismissed.
   */
  dismissedNotificationId?: string
}
