# TODO

- Add WW icon to widgets (small top right)
- Resolve Revenuecat not working in dev.
- Add e2e tests
- Upgrade remaining dependencies.
- remove all references to android in codebase, update expo scripts + ci to only care about iOS.
- Update documentation for project structure
- Add deep links to sharing file so it'll automatically import and navigate the user to the imported contact.
- Add a donation nudge reminder for users who have 'high' app usage. Define 'high' usage.
- Check if we can just link direction to kofi instead of using in-app purchases since Apple has updated their TOS recently.
- Finish tutorials
- Add 'thank you' screen on donation page that includes short bio about me, where I'm currently at, what I'm doing, and I hope it serves you well - add little signature at the bottom and image of myself.
- Add data disclosure information screen "your privacy is important" to onboarding
- Add "premium" screen to onboarding -- that is a psuedo premium screen: donations are optional, all services are always free but please keep in mind of time and cost associated with app development.
- Since we're no longer cross-platform, redesign app to be in "Apple's Design language", but with our own colors.
- Update all components to use tamagui buttons, sheets, lists, etc.
- Remove all android references in the codebase. the app is now ios only.
- update calendar widget to default add time, + button adds plan. Add plan helper text.
- Add a toggle to swap between time added and time planned
- Add dismiss/cancel to "Missed conversations reminders"
- Add contextual donation card after monthly report submission. Only show after 6-month app anniversary. Max 1 per 60 days, never if dismissed.
- Add cancellation flow intercept: offer "Pause for 1/3/6 months" before cancelling recurring donation.
- "Gift a supporter year" — let donors sponsor supporter status for another user.
- Service-year donation prompt — gentle one-time ask in early September for annual support.
- Yearly service summary — polished "year in review" card (contacts made, studies conducted, hours served) sharable as an image.
- "Streaks" tracking — consecutive weeks with service time logged.
- Add "profile" section to onboarding with profile card.
  - Shows info like "since xxxx year started using", pfp image upload (local only)
  - Immediately after privacy important
- Add "WitnessWork" fade in and grand reveal at startup. It should have a very terse and useful description for what witnesswork does right below it, the intro screen to excite the user.
- Make the lock screen larger widget remove the encouragement text and overall increase the font size of the "month" and hours and progress bar size.
- Resolve gap where "Search address" isn't enabled unless the user enables location services. Currently if user hasn't enabled location services, the queries are wildly inaccurate as it doesn't have a coordinate to center its searches off of.
- Resolve build issue: We noticed one or more issues with a recent delivery for the following app:

- WitnessWork
- App Apple ID 6469723047
- Version 1.38.2
- Build 125

Although delivery was successful, you may want to correct the following issues in your next delivery. Once you've corrected the issues, upload a new binary to App Store Connect.

## ITMS-90737: Missing Document Configuration - By declaring the CFBundleDocumentTypes key in your app, you've indicated that your app is able to open documents. Please set the UISupportsDocumentBrowser key to 'YES' if your app uses a UIDocumentBrowserViewController. Otherwise, set the LSSupportsOpeningDocumentsInPlace key in the Info.plist to 'YES' (recommended) or 'NO' to specify whether the app can open files in place. All document-based apps must include one of these configurations. For more information, visit <https://developer.apple.com/document-based-apps/>

## Supporter features

- Supporter badge + "Supporter since [year]" line in Settings for donors.
- Alternate app icons (gold, dark, seasonal, minimalist).
- Custom accent color picker (beyond default palette).
- Custom progress bar themes for monthly goals.
- Custom notification sounds for return visit reminders.
- Custom report export themes (PDF with personalized header/branding).
- Advanced annual analytics (trends over time, month-over-month comparisons, personal bests).
- iCloud sync (real cloud backup vs local-only).
- Multiple backup slots (free = 1, supporter = 5).
- Quick-add Siri Shortcuts for logging time.
- Early access to beta features via TestFlight.
