import apis from '@/constants/apis'
import { mmkvStorage } from '@/stores/mmkv'
import { createAnnouncementClient } from '@/features/announcements/lib/announcementClient'

export const announcementClient = createAnnouncementClient({
  endpoint: apis.announcements,
  storage: mmkvStorage,
})
