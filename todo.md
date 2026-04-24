# TODO

- update revenuecat to have dev bundle specific instance.
- Add e2e tests
- Upgrade remaining dependencies.
- Fix hatch pattern,
- Update documentation for project structure
- Refactor components to not directly access publisher data, but instead call usePublisher.
- Refactor/break down preferences into smaller stores, it's getting a bit convoluted. Publisher data should live in its' own store.
- Add a "pet" feature. To define later.
- "What's the sloppiest part of this codebase, and how can we fix it?"
- Add milestone celebration page with animated present.
- Add year wrapped golden present.
- Make the 'outer edge'/'rim' of the tab bar smaller
- Change backup messaging on @backupreminder to also mention "or turn on icloud sync"
- Resolve random i18n issues, especially when generating strings -- for example MilestoneAdjustSheet not using i18n on renderSubtitle()
- Add a "this year, wrapped" spotify style animations and service "year end" card that shows their interesting stats, information, etc. Final card should be sharable as image for social media, etc. Also make sure we have app branding included in this polish UI.
- Add deep links to sharing file so it'll automatically import and navigate the user to the imported contact.
- Add 'thank you' screen on donation page that includes short bio about me, where I'm currently at, what I'm doing, and I hope it serves you well - add little signature at the bottom and image of myself.
- Since we're no longer cross-platform, redesign app to be in "Apple's Design language", but with our own colors.
- Update all components to use tamagui buttons, sheets, lists, etc.
- Add a toggle to swap between time added and time planned
- Add cancellation flow intercept: offer "Pause for 1/3/6 months" before cancelling recurring donation.
- "Gift a supporter year" — let donors sponsor supporter status for another user.
- Service-year donation prompt — gentle one-time ask in early September for annual support.
- Yearly service summary — polished "year in review" card (contacts made, studies conducted, hours served) sharable as an image.
- Add 'Badges' feature. Highest badge based on weight, or user selected badge should appear on ProfileCard. ProfilDetailOverlay should contain more details about top 3 badges. There should be a separate Badge screen that overviews "See all" badges, with non-unlocked badges in 'grey' state. Each badge should be unique and have its' own art. We'll need to figure out a good solution on how to source art or art-like references through emojis or something else? Given that badges are special, we probably don't want to do emojis.
- Update / handle all "Get started" actions and validate functionaltiy.
- Update lists to use ListItem: <https://tamagui.dev/ui/list-item> across the ENTIRE application and be styled in iOS 26, liquid glass aesthetic and design scheme. We want 100% iOS UI styling. It should feel like a native iOS app made by Apple. /grill-me
- Review month and year screen for improvements to analytics, revisit and reconsider what is the best data display format for the given data.
- Year screen: show months remaining in service year -- somewhere.
- See about implementing a social 'friends' feature similar to apple workouts/activity where users will get notified about friends week/month achievements, badge unlocks, etc. Look to see if existing iOS sdk exists to implement this or if we have to roll this ourselves with API and db.
- Remove categories breakout -- merge it into existing detailed progress bar.
- Fix bug: open day sheet directly when tapping on this week's day.
- Move "This Week" section directly to home screen above the Timer. Add preference to toggle
- Add deep links from reminder notification -> contact details page.
- Make the lock screen larger widget remove the encouragement text and overall increase the font size of the "month" and hours and progress bar size.
- Resolve gap where "Search address" isn't enabled unless the user enables location services. Currently if user hasn't enabled location services, the queries are wildly inaccurate as it doesn't have a coordinate to center its searches off of.

## Supporter features

- Alternate app icons (gold, dark, seasonal, minimalist).
- Custom progress bar themes for monthly goals.
- Custom notification sounds for return visit reminders.
- Custom report export themes (PDF with personalized header/branding).
- Advanced annual analytics (trends over time, month-over-month comparisons, personal bests).
- Multiple backup slots (free = 1, supporter = 5).
- Quick-add Siri Shortcuts for logging time.
- Early access to beta features via TestFlight.
