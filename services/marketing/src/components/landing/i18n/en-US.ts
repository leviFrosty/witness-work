/**
 * The landing page's English copy, the source every other locale translates.
 * `**text**` marks a phrase the page highlights; keep the markers when
 * translating. Times and numbers are strings so each locale can write them its
 * own way.
 */
const enUS = {
  meta: {
    title: "WitnessWork: the field service app for Jehovah's Witnesses",
    description:
      'Track your time, plan your month, and remember every return visit, with gentle nudges that keep you on track. Free, private, and in 19 languages on iPhone, iPad, Apple Watch, and Android.',
  },
  nav: {
    home: 'WitnessWork home',
    features: 'Features',
    devices: 'Devices',
    privacy: 'Privacy',
    help: 'Help Center',
    getApp: 'Get the app',
    menu: 'Menu',
    language: 'Language',
    skip: 'Skip to content',
    pause: 'Pause motion',
  },
  store: {
    appStore: 'Download on the App Store',
    googlePlay: 'Get it on Google Play',
  },
  hero: {
    title: 'Made for the ministry.',
    body: 'Your time, plans, and return visits in one calm, private place, with gentle nudges that keep you on track.',
    note: 'Free forever · No ads',
    rating: '4.9',
    ratingLabel: 'from 700+ App Store ratings',
    screenAlt:
      "WitnessWork's Home screen: Quick Actions with Scribe AI, this month's service report, and today's return visits.",
  },
  proof: {
    title: 'Loved in the ministry',
    stats: [
      { value: '4.9', label: 'App Store rating' },
      { value: '10K+', label: 'publishers every month' },
      { value: '100+', label: 'countries' },
      { value: '19', label: 'languages' },
    ],
  },
  statement: {
    eyebrow: 'Why WitnessWork',
    title: 'Less mental math. More ministry.',
    body: "WitnessWork keeps count of your hours, plans, return visits, and Bible studies, so you always know where you stand and can give your attention to the people you're helping.",
  },
  journey: {
    eyebrow: 'A day in service',
    title: 'One day. Every device.',
    body: 'From your first call to your last, WitnessWork moves with you.',
    steps: [
      {
        time: '8:48 AM',
        title: "See what's next",
        body: "Up Next on your wrist shows your next return visit: who, where, and what you'll talk about.",
        alt: 'Up Next on Apple Watch: a return visit with Maria Santos at 10:30 AM.',
      },
      {
        time: '9:30 AM',
        title: 'Start the morning',
        body: "Today's plan, today's return visits, and this month's progress, all on Home.",
        alt: "WitnessWork's Home screen with today's return visits.",
      },
      {
        time: '10:30 AM',
        title: 'Remember every conversation',
        body: 'Log the visit and set the next one in seconds. Notes, studies, and follow-ups stay together.',
        alt: "A contact's page with the next visit, notes, and conversation history.",
      },
      {
        time: '4:00 PM',
        title: 'Unfold for more',
        body: 'Open iPhone Duo and your contacts and their history sit side by side.',
        alt: "WitnessWork open on iPhone Duo with contacts beside a contact's details.",
      },
      {
        time: '7:30 PM',
        title: 'Look back on the day',
        body: 'On iPad, review your month and service year, then plan the weeks ahead.',
        alt: "WitnessWork on iPad in landscape, with this month's progress beside the sidebar.",
      },
    ],
  },
  progress: {
    eyebrow: 'Progress',
    title: 'Always know where you stand.',
    body: 'See your hours, studies, and goal at a glance. WitnessWork works out **what it takes each day** to finish strong, counts credit hours and LDC the right way, and sends your report in a tap.',
    month: 'This month',
    year: 'This service year',
    alt: 'Progress for the month: 45.8 of 50 hours, 1.5 hours a day to reach the goal, and 4 Bible studies.',
    yearAlt:
      'Service year pace: 4.4 hours ahead, with a chart of logged and planned hours.',
  },
  plan: {
    eyebrow: 'Schedule',
    title: 'Plan your month in a tap.',
    body: "Pick the days you go out and the Assistant **spreads your goal across them**. Recurring plans, reminders, and your buddies' days keep the weeks on track.",
    alt: 'The schedule calendar for October, with completed days in green and buddies on upcoming days.',
    detailAlt:
      'A planned morning of cart witnessing on Saturday with two buddies invited.',
  },
  visits: {
    eyebrow: 'Return visits',
    title: 'Never lose a return visit.',
    body: "Every householder, note, and follow-up lives in one place, **on a list or on a map**. WitnessWork reminds you who's due, so no one is forgotten.",
    note: {
      when: 'Today, 10:30 AM',
      text: "Lesson 3 went well. She's reading ahead and asked what God's Kingdom will do. Next time: Daniel 2:44.",
      next: 'Next visit: Wednesday, 10:30 AM',
    },
    listAlt:
      'Contacts with follow-ups due today, Bible studies, and recent visits.',
    mapAlt: 'Return visits as pins on a map.',
  },
  scribe: {
    eyebrow: 'Scribe AI',
    title: 'Just say it.',
    body: 'Speak, type, or scan your notes. Scribe AI turns them into time, plans, contacts, and follow-ups. **Nothing is added until you tap Add.**',
    demo: {
      listening: 'Listening…',
      transcript:
        'I did an hour and a half this morning. Plan two hours tomorrow at 9 with Anna.',
      reply: "Here's what I'll add:",
      cards: [
        { kind: 'Time', title: '1.5 hrs field service', detail: 'Today' },
        {
          kind: 'Plan',
          title: '2 hrs at 9:00 AM',
          detail: 'Tomorrow · with Anna',
        },
      ],
      add: 'Add 2',
      added: 'Added',
    },
    alt: 'Scribe AI showing a time card and a plan card, ready to add.',
  },
  buddies: {
    eyebrow: 'Buddies',
    title: 'Go out together.',
    body: "Connect with up to five friends you go out with. See each other's planned days, **invite them to yours**, and know who's going, end-to-end encrypted on iPhone and Android.",
    alt: "Anna Brooks's buddy page, with the days you're both going out in the next two weeks.",
  },
  route: {
    eyebrow: 'Route planning',
    title: 'The best route, in order.',
    body: "Put the day's stops in **the fastest driving order**, see when you'll arrive, and start in your favorite maps app.",
    alt: 'A route with two return visits and arrival times.',
  },
  delight: {
    eyebrow: 'Streaks, badges & your pet',
    title: 'Celebrate faithful habits.',
    body: 'Keep your streak going, earn badges that grow from **Bronze to Pearl**, and raise a companion who cheers you on.',
    petAlt: 'Leo the lion cub in his room.',
    badgesAlt: 'Badges earned for sharing each month and sending reports.',
  },
  more: {
    title: 'And so much more.',
    items: [
      {
        title: 'Widgets',
        body: 'Your hours and calendar on your Home and Lock Screens.',
      },
      { title: 'Siri and Shortcuts', body: '“Add time in WitnessWork.” Done.' },
      { title: 'Mileage', body: "Log trips and see the month's fuel cost." },
      {
        title: 'App Lock',
        body: 'Keep your records behind your face, fingerprint, or passcode.',
      },
      {
        title: 'Bring your data',
        body: 'Import from MyTime and other apps in minutes.',
      },
      {
        title: 'Calendar Sync',
        body: 'See plans and follow-ups in your calendar.',
      },
      {
        title: 'Backup',
        body: 'Encrypted backups that only your devices can read.',
      },
      { title: 'Rich notes', body: 'Format your notes and add photos.' },
      {
        title: 'Make it yours',
        body: 'Rearrange Home, pick tabs, and choose light or dark.',
      },
      {
        title: 'Accessible',
        body: 'Larger and bold text, plus screen reader support.',
      },
    ],
    widgetAlt:
      "The WitnessWork calendar widget on a Home Screen, showing this week's plans.",
    appleOnly: 'iPhone and iPad',
  },
  devices: {
    eyebrow: 'Every device',
    title: 'One app. Every screen.',
    body: 'WitnessWork feels at home on every screen you use.',
    poses: { closed: 'Closed', half: 'Half open' },
    tabs: {
      iphone: {
        name: 'iPhone',
        title: 'Everything, in your pocket.',
        body: 'Time, plans, contacts, and progress one tap away, with widgets and Siri built in.',
      },
      ipad: {
        name: 'iPad',
        title: 'Room to plan.',
        body: 'A sidebar, side-by-side views, keyboard shortcuts, and pointer support make planning a pleasure.',
      },
      duo: {
        name: 'iPhone Duo',
        title: 'Unfold your ministry.',
        body: "Closed, it's your pocket companion. Open it, and Contacts, Schedule, and Progress spread across two columns that meet the fold.",
      },
      watch: {
        name: 'Apple Watch',
        title: 'Your ministry at a glance.',
        body: "See this month's hours, add time, run your timer, and check Up Next from your wrist.",
      },
      android: {
        name: 'Android',
        title: 'Just as good on Android.',
        body: 'The same app on Android phones and tablets, with a Wear OS app and Google Drive sync.',
      },
    },
    ipadAlt: 'WitnessWork on iPad with the sidebar and the schedule.',
    duoClosedAlt: 'WitnessWork on the outer display of iPhone Duo.',
    duoOpenAlt: 'WitnessWork open on iPhone Duo, in two columns.',
    watchAlt: 'WitnessWork on Apple Watch.',
    androidAlt: 'WitnessWork on an Android phone.',
  },
  sync: {
    eyebrow: 'Cloud Sync',
    title: 'Log it anywhere. See it everywhere.',
    body: "Add time on your watch or plan on your iPad, and it's on your phone a moment later, **even between iPhone and Android**. Only your devices can read it.",
    demo: {
      added: '+2 hrs added',
      on: 'on Apple Watch',
      encrypted: 'Encrypted',
      month: 'October',
      before: '45.8',
      after: '47.8',
      alt: 'Two hours added on Apple Watch travel, encrypted, to iPhone, iPhone Duo, iPad, and an Android phone, and each one updates from 45.8 to 47.8 hours.',
    },
  },
  supporter: {
    included: 'Included with Supporter.',
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'Private by design.',
    body: 'Your ministry records are personal. WitnessWork treats them that way.',
    items: [
      {
        title: 'No sign-up. No ads.',
        body: 'Your account is anonymous: no email, phone number, or password.',
      },
      {
        title: 'Kept on your device',
        body: 'Your records live on your devices, and you decide whether they sync or back up.',
      },
      {
        title: 'End-to-end encrypted',
        body: 'Only your devices can read your synced and backed-up records, and only your buddies can read what you share with them.',
      },
      {
        title: 'Locked when you want',
        body: 'Lock WitnessWork with your face, fingerprint, or passcode.',
      },
      {
        title: 'Zero data retention',
        body: "Scribe AI works only with providers that don't store what you send.",
      },
      {
        title: 'Open source',
        body: "Anyone can read WitnessWork's code on GitHub.",
      },
    ],
  },
  languages: {
    eyebrow: 'Languages',
    title: 'Speaks your language.',
    body: 'Available in 19 languages.',
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'Everything you need. Free.',
    body: 'No ads, no sign-up, no catch. Every feature for your ministry is free for everyone.',
    freeItems: [
      'Time and reports',
      'Goals and daily pace',
      'Return visits and studies',
      'Your visits on a map',
      'Plans and reminders',
      'Buddies',
      'Scribe AI, with a monthly limit',
      'Apple Watch and Wear OS',
      'Widgets and Siri on iPhone and iPad',
      'Encrypted backup',
      'Calendar Sync',
      'Streaks, badges, and your pet',
    ],
    supporterTitle: 'Supporter is optional.',
    supporterBody:
      'If WitnessWork helps your ministry, a subscription helps keep it going. As a thank-you, Supporters get:',
    supporterItems: [
      'Sync across all your devices',
      "The day's best route",
      'More Scribe AI',
      'Accent colors, plus app icons on iPhone and iPad',
      'The Supporter badge',
    ],
    supporterNote:
      'Subscribe in the app to see prices where you live. Cancel anytime.',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Questions? Answers.',
    more: 'Visit the Help Center',
    open: 'Read the full answer',
  },
  cta: {
    title: 'Your ministry, on track.',
    body: 'Download WitnessWork free for iPhone, iPad, Apple Watch, and Android.',
    qr: 'Scan to download',
  },
  footer: {
    contact: 'Contact',
    source: 'Source code',
    privacy: 'Privacy Policy',
    terms: 'Terms of Use',
    independent:
      "WitnessWork is an independent app. It isn't affiliated with the Watch Tower Bible and Tract Society of Pennsylvania.",
    trademarks:
      'Apple, iPhone, iPad, Apple Watch, Face ID, Siri, and iCloud are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc. Google Play, Android, Wear OS, and Google Drive are trademarks of Google LLC.',
  },
}

export default enUS

/** Every locale's copy has English's shape. */
export type LandingMessages = typeof enUS
