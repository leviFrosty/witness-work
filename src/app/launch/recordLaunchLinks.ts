import { recordLaunchLinks } from '@/lib/launchLinks'

// Imported first by the entry file, before the rest of the app loads, so a
// link tapped while it starts isn't dropped.
recordLaunchLinks()
