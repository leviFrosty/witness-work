import { ProfileAvatar } from '@/types/avatar'

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

  phoneRegionCode?: string
  email?: string
  gender?: 'male' | 'female' | 'unknown'
  address?: Address

  coordinate?: Coordinate

  userDraggedCoordinate?: boolean
  createdAt: Date

  updatedAt?: number

  customFields?: Record<string, string>

  consentGivenAt?: string

  redacted?: boolean

  readdedAt?: number

  detailsRetainUntil?: number

  dismissedUntil?: Date

  dismissedNotificationId?: string

  isFavorite?: boolean

  avatar?: ProfileAvatar

  avatarBackground?: string | null

  heroBackground?: string | null

  avatarMeta?: {
    width: number
    height: number
    fileSize?: number
    capturedAt?: string
    croppedAt?: string
  }
}
