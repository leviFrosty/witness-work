# TODO

- Add e2e tests
- Upgrade remaining dependencies.
- Fix hatch pattern
- Update documentation for project structure
- Add a "pet" feature. To define later.
- "What's the sloppiest part of this codebase, and how can we fix it?"
- Add year wrapped golden present.
- Change backup messaging on @backupreminder to also mention "or turn on icloud sync"
- Add a "this year, wrapped" spotify style animations and service "year end" card that shows their interesting stats, information, etc. Final card should be sharable as image for social media, etc. Also make sure we have app branding included in this polish UI.
- Add cancellation flow intercept: offer "Pause for 1/3/6 months" before cancelling recurring donation.
- "Gift a supporter year" — let donors sponsor supporter status for another user.
- Service-year donation prompt — gentle one-time ask in early September for annual support.
- Yearly service summary — polished "year in review" card (contacts made, studies conducted, hours served) sharable as an image.
- Add 'Badges' feature. Highest badge based on weight, or user selected badge should appear on ProfileCard. ProfilDetailOverlay should contain more details about top 3 badges. There should be a separate Badge screen that overviews "See all" badges, with non-unlocked badges in 'grey' state. Each badge should be unique and have its' own art. We'll need to figure out a good solution on how to source art or art-like references through emojis or something else? Given that badges are special, we probably don't want to do emojis.
- Update lists to use ListItem: <https://tamagui.dev/ui/list-item> across the ENTIRE application and be styled in iOS 26, liquid glass aesthetic and design scheme. We want 100% iOS UI styling. It should feel like a native iOS app made by Apple. /grill-me
- See about implementing a social 'friends' feature similar to apple workouts/activity where users will get notified about friends week/month achievements, badge unlocks, etc. Look to see if existing iOS sdk exists to implement this or if we have to roll this ourselves with API and db.
- Fix bug: open day sheet directly when tapping on this week's day.
- Add spiritual goals list section on ProfileDetailOverlay:
  - Reminders (optional)
  - Goal
  - Date

## Supporter features

- Custom progress bar themes for monthly goals.
- Custom notification sounds for return visit reminders.
- Custom report export themes (PDF with personalized header/branding).
- Advanced annual analytics (trends over time, month-over-month comparisons, personal bests).
- Multiple backup slots (free = 1, supporter = 5).
- Quick-add Siri Shortcuts for logging time.
- Early access to beta features via TestFlight.
