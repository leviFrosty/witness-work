# UI consistency audit: contact and visit flows

This audit covers the assigned contact, visit, map, profile, Notes Import,
onboarding, Supporter, and Updates surfaces. The shared input primitives in
`src/components/ui/inputs/` now carry the reviewed input geometry; feature
forms use the common default without per-field providers. Drawer rows
explicitly opt into their compact layout.

## Applied

- `ContactFormScreen` uses shared outlined inputs for the contact name,
  address, personal contact, phone, email, and custom-field controls.
- The contact identity header is a compact `ContactIdentityCard` with a 64pt
  avatar, left-aligned name, 44pt gender controls, and the hero-background
  picker kept beside the identity controls.
- Address search, address lines, city/state, ZIP/country, and phone opt into
  full-width controls inside their rows so the shared 48% compact default is
  not compounded by nested half-width address columns or the custom phone
  input.
- The address map-pin action keeps the shared 12pt/16pt inset rhythm when
  rendered inside its rounded `Section` group.
- Address autocomplete results can extend beyond the input row so suggestions
  and the error state are not clipped by rounded groups.
- `ProfileCard` uses the shared outlined input for its inline profile-name
  editor, including onboarding and existing-user profile setup.
- `ContactsFilterSheet` uses the shared outlined input for typed filter values;
  field/operator chips remain compact selection controls.
- `VisitFormScreen` uses the common form layout for date, note, Bible Study,
  follow-up, topic, and notification controls. The notification preference is
  represented by a switch; imported and record-selection toggles use the same
  switch treatment.
- Visit date and follow-up date/time pickers use horizontal auto-width rows so
  the native controls stay aligned without being squeezed into the compact
  control width.
- Phone, Email, and active custom-field values share one Information section.
  Email uses a horizontal fixed-label row; user-defined custom-field labels
  remain stacked so variable labels do not squeeze their values. A compact
  header action opens custom-field management even when none are active.
- Manage Custom Fields places the Add New Field row first. Active definitions
  keep visible ordering arrows and an archive menu action; archived definitions
  expose restore and confirmed permanent-delete actions from the shared row
  actions menu.
- These forms inherit outlined controls, a 44pt minimum control height, 76pt
  rows, 12pt horizontal insets, 10pt control gaps, 4pt label/description
  spacing, and a 200pt control maximum from the shared primitives.
- Existing behavior, validation, navigation, notification scheduling, and
  custom-field management remain feature-owned.

## Reviewed surfaces and intentional exceptions

### Contacts

Reviewed `ContactFormScreen`, `ContactIdentityCard`, `AddressSection`, `AddressAutocomplete`,
`PersonalContactSection`, `ContactsScreen`, `ContactsSortAndFilterScreen`,
`ContactsFilterSheet`, `ContactDetailsScreen`, `DismissContactSheet`,
`DismissedContactsScreen`, `RecoverContactsScreen`, `PinLocation`, and
`ContactAvatarViewer`. The avatar/gender hero, live list search, map pin
editor, and destructive confirmation sheet keep their focused layouts. The
contact name and typed filter value use shared outlined inputs, while the
filter builder's field/operator controls remain compact selections. Gender
chips are mutually exclusive identity choices and remain chips.

### Visits

Reviewed `VisitFormScreen`, `RescheduleVisitScreen`,
`ApproachingConversations`, `ApproachingConversationsRow`, and
`MissedConversations`. Visit entry fields use the shared form layout.
Rescheduling is an action-oriented choice flow with quick-date chips and
date-picker cards rather than a field form, so its card treatment remains
separate.

### Map

Reviewed `MapScreen`, `MapOnboarding`, `MapCarouselCard`, `MapColorKey`, and
`ShareAddressSheet`. Search, marker cards, onboarding fetch/permission steps,
and address sharing are map-specific controls and do not contain reusable
label/control rows. Map onboarding uses switches for contact selection.

### Notes Import

Reviewed `NotesImportComposerScreen`, `NotesImportChatInput`,
`NotesImportPreview`, `NotesImportRecordRow`,
`NotesImportContactDetailsModal`, `NotesImportHelpSheet`,
`NotesImportHistoryPopover`, `NotesImportRefinementBubble`,
`NotesImportThinking`, `NotesImportUsage`, `NotesImportDataHandling`, and
`NotesImportHeaderActions`. The composer is intentionally one shared
multiline chat input for initial import and refinement; preview and record
selection use the common switch treatment.

### Onboarding, Profile, Supporter, and Updates

Reviewed all screens and components under `onboarding`, `profile`,
`supporter`, and `updates`, including onboarding import/profile steps, the
profile card and overlays, paywall/thank-you surfaces, FAQ search, and What's
New sheets. Onboarding's publisher and profile steps reuse the shared form
rows, and the editable profile name is covered by the shared outlined input.
The remaining surfaces are guided, showcase, paywall, search, or content
flows with their own focused controls. Existing multiline copy retains natural
line height and flexible widths for small phones and larger text settings.

## Verification

The repository-wide input, `Section` child, route, and sheet inventory is
complete; Astra max found no unknown input groups. Final checks pass: lint,
typecheck, 90 test files with 1,228 tests, dependency validation with no
circular dependencies, and `git diff --check`.

Runtime verification covered dark ProMax drawer and Publisher states, normal
and error Contact name outlines, the compact 64pt contact identity card with
gender/avatar/background editing, grouped address search/results/manual/pin
states, the consolidated phone/email/custom-field Information section, native
switches, and light 390pt iPhone 17e Onboarding, Profile, Add Time, compact Type/Hours/Minutes
controls, 44pt controls, 80pt full-width notes, wheel-picker modal, and Custom
Fields management add/order/archive/
restore/delete menus and confirmation cancellation. The installed simulator dev binary
kept a native splash overlay above the live React tree; the reviewer
temporarily hid only that noninteractive splash view for inspection, without a
source or store change. Clean native launch was not validated, and
representative states do not cover every interaction.
