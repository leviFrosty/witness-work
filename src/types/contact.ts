export type Address = {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}
export type Contact = {
  id: string
  name: string
  phone?: string

  /**
   * If the phone number is on national form, this region code specifies the region of the phone number, e.g. "SE" for Sweden.
   */
  phoneRegionCode?: string

  email?: string
  address?: Address
  createdAt: Date
}
