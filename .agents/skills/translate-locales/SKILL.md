---
name: translate-locales
description: Translate WitnessWork's app strings from `src/locales/en-US.json` into the other locale files using established Jehovah's Witness terminology. Builds a worklist of missing, changed and broken keys, translates them (in parallel per locale when large), applies them, lints placeholders, plurals and Siri phrases, and re-syncs the native string catalogs. Use during /cut-release, when the user asks for translations, when a change can't ship in English only, or when translating store release notes.
---

# Translate locales

You're WitnessWork's translator; there's no separate approval step. `src/locales/en-US.json` is the source of truth.

- **Feature work:** add and change strings in `en-US.json` only. Other Languages fall back to English for any key they lack (`enableFallback` in `src/lib/locales.ts`), so untranslated keys still render.
- **Release cut:** `/cut-release` uses this skill to translate every missing, changed or broken key into every locale.
- **Earlier** only when the user asks or a change can't ship in English only.

## Where strings go

- `src/lib/locales.ts` loads the 18 target files through i18n-js. `ar` is Arabic (one file for every Arabic-speaking country, and the one right-to-left Language), `bem-ZM` is Bemba, `rw-RW` Kinyarwanda and `sw-KE` Swahili. Interpolation is `{{name}}` or `%{name}`. Plural objects use the CLDR forms `zero`/`one`/`two`/`few`/`many`/`other` (see Plurals below).
- `pnpm sync:widget-shared` copies the keys listed in `src/app/watch/watchStringKeys.json` from every locale into the native string catalogs: the Apple Watch and its widgets (`targets/watch/*.xcstrings`, `targets/watch-widgets/Localizable.xcstrings`), Siri (`targets/intents/*.xcstrings`), the iPhone widgets and Live Activity (`targets/widgets/Localizable.xcstrings`), the Buddies alerts (`targets/notification-service/Localizable.xcstrings`) and Wear OS (`targets/wear-os/src/main/res/values*/watch_strings.xml`). Stage all of them with the locale files. The pre-commit hook fails until you re-run it after changing a locale file, or while a Siri phrase breaks the rules below. A Language missing a catalog string gets the English text, but Siri phrases have no English fallback: until a Language has its own, Siri can't run the actions by voice in it, though they still appear in the Shortcuts app.
- Locale files don't drive iOS permission prompts (`app.config.ts` reads English), store release notes (below) or ww-api's shared-contact page (`~/dev/ww-api/src/contactLinkLocales.ts`).
- Crowdin is gone. Users report bad translations in GitHub issues (see the readme's Languages section); fix those in the locale file and check them with `lint` and the terminology below like your own output.
- The old Azure `pnpm translate` script and its `i18n-auto-translation` devDependency were removed in favor of agent translation; don't bring them back.

## Workflow

`locales.mjs` beside this file does the bookkeeping. Run it from the repo root as `node .agents/skills/translate-locales/locales.mjs <command>`.

1. **Worklist.** `todo --since <ref>` writes `.asc/translations/<locale>.todo.json` (git-ignored) for each locale. Each key has its English and a reason:
   - `missing`: absent or empty.
   - `changed`: English changed since `<ref>` but the translation didn't. `was` holds the old English and `current` the stale translation.
   - `lint`: the current translation fails a check (`problems`).

   Plural forms the Language needs but English lacks, such as Russian `few`, appear as their own keys (`contactDetails.studyCount.few`). Their `en` is English's `other`, and `form` says which numbers the form covers.

   At a release cut `<ref>` is the last released tag. Without `--since` you only get `missing` and `lint`. `--locale ru-RU` (repeatable) limits the run; `--chunk 300` splits big worklists into `-01`, `-02`, … files.

2. **Glossary.** `terms <locale> publisher pioneer "return visit" "Bible study" ministry` shows how existing strings render each term, shortest first. Settle on one term per concept before translating (see Terminology).
3. **Translate** every key into `.asc/translations/<locale>.done.json`, using the same `-NN` suffix as its todo file: a flat object of `"dotted.key": "translation"`.
4. **Apply.** `apply <locale> <done file>` checks every key first and writes nothing if any fails. New keys go beside their English neighbors and changed ones are replaced in place. `--dry-run` only checks.
5. **Verify.** Run `lint` (every locale; exits nonzero on any problem) and `pnpm check:locales`. Then run `pnpm sync:widget-shared` and stage the catalogs it rewrites (every file listed under Where strings go) along with the locale files.
6. **Report** per locale: key counts by reason, your term choices, and any strings you're unsure of. Delete `.asc/translations/` once the locale files are committed.

## Parallel translation

A release cut can cover thousands of strings, so fan out: one subagent per locale, or per chunk for big worklists. Locale files are independent and can run at the same time, but apply each locale's chunks one after another. Brief each subagent with:

> Translate WitnessWork strings into `<locale>`. Read `.agents/skills/translate-locales/SKILL.md` (Translation rules and Terminology) and `CONTEXT.md`. Your input is `.asc/translations/<locale>.todo[-NN].json`. Build a glossary with `terms` first. Write `.asc/translations/<locale>.done[-NN].json` covering every key, then run `node .agents/skills/translate-locales/locales.mjs apply <locale> <done file> --dry-run` until it passes. Don't edit `src/locales` or any other file. Report the key count, your term choices and any strings you're unsure of.

Then apply the done files and spot-check each locale: the same term for the same concept across chunks, and quoted labels that match their keys.

## Translation rules

- **Values only.** Keep English's keys and nesting; don't add, rename or delete keys, apart from the plural forms your Language needs (Plurals below). A key that's gone from `en-US.json` is dead: nothing reads it, but every app binary and OTA bundle still ships it. `prune` deletes those keys from every locale, and `lint` flags any that are left.
- **Placeholders** stay exactly as written: `{{count}}`, `%{name}`, `${applicationName}`. Keep the same names and the same number of each, and translate nothing inside the braces. Move them wherever the grammar needs. Keep `**bold**` markers around the matching words.
- **Plurals.** `src/lib/locales.ts` registers each Language's CLDR cardinal rule (from `make-plural`) with i18n-js. For a count it tries `zero` first when the count is 0 (English uses it for "No matches"), then the Language's category, then `other`, so a missing form falls back to `other` instead of showing a missing-translation string. A plural key the Language doesn't have yet renders English's forms by English's rule (`i18n.t` in `src/lib/locales.ts`), so it reads as plain English until translated. `lint` checks each locale against its own rule:
  - **Required:** every category a whole number from 0 to 1,000 lands on, plus `other`. English, German and most others need `one`/`other`; Russian and Ukrainian `one`/`few`/`many`/`other`; Arabic all six; Japanese, Korean, Vietnamese and Chinese only `other`.
  - **Optional:** categories only huge numbers reach, such as French, Spanish, Italian and Portuguese `many` (a million). `other` covers them.
  - **Never renders:** a form outside the Language's categories, such as `few` in German. English's own forms are always allowed, so the files keep English's shape (Japanese still has `one`, though `other` renders for 1 there; write `other` so it reads right for 1 too).
  - **`one` that isn't just 1:** in French and Brazilian Portuguese `one` also covers 0 and 1.5, in Russian and Ukrainian 21, 31 and 101. There `one` must show the count like English `other` (`{{count}} contact`), not "1 contact" or "a day".
  - **Arabic `one` and `two` may drop the count.** In Arabic `one` is only 1 and `two` only 2, and the noun carries the number: «ساعة واحدة» (one hour), «ساعتان» (two hours), «قبل يومين» (two days ago). Write prose that way, without `{{count}}` (or whichever placeholder shows the count, such as `{{days}}`); "١ ساعة" and "٢ ساعتان" read as machine output. Keep the count where the digit is the point: short unit labels (`hoursShort`, `minutesShort`, `goalHoursSuffix`), chart labels, progress like `{{done}} من {{count}} شهر`, and counters beside an icon. There write the singular after the digit for 1 and 2 (`{{count}} ساعة`), like `many` and `other`, not the dual. `zero`, `few` and `many` always keep the count. The lint allows `one`/`two` with English `other`'s placeholders or with one of them left out.
  - Extra forms use exactly the placeholders of English `other`. Write each form in the grammar its numbers take (Russian `few`: 2 контакта, `many`: 5 контактов).
- **Meaning over words.** Translate what the UI does, naturally, and keep labels and buttons about as short as English. When a string quotes a UI label (a FAQ answer, "turn on Log my hours"), use that label's translation from the same locale.
- **Register.** Match the file's form of address, such as German `du` or French `vous`. Check a few existing strings first.
- **Names.** Keep WitnessWork and Scribe AI. Use Apple's and Google's localized names for their products and settings (Shortcuts, Settings, Google Play).
- **Platform variants.** A key ending in `Android` is the Android wording of the same key without the suffix. Keep iPhone, iOS and App Store out of Android variants and Google Play out of the iOS ones. Shared strings stay platform-neutral.
- **No "magic"** wording or imagery in any Language.
- **Numbers and right-to-left text.** The app prints numbers passed to a placeholder in the Language's own digits (Arabic-Indic for Arabic, `src/lib/numbers.ts`), so leave placeholders as they are. Numbers you write into a string yourself use the Language's digits too (`١ أسبوع`). In Arabic, put a right-to-left mark (U+200F) on both sides of a range dash (`{{start}}(U+200F)–(U+200F){{end}}`), as jw.org/ar does, so the start stays on the right.
- **Siri phrases** are the `shortcutPhrases` keys in `src/app/watch/watchStringKeys.json`. Each is a spoken command: natural and short in that language, with `${applicationName}` exactly once and no digits (spell numbers out). It must also differ from every other phrase in that Language. `faq_siri_a` quotes these phrases with "WitnessWork" in place of `${applicationName}`, so its quotes must match the translated phrases exactly. `lint` checks the mechanical rules, but whether a phrase sounds natural is up to you. A phrase with `${spokenDuration}` takes one of the `siriSpokenDuration*` durations, so word it to read naturally around "two hours" or "30 minutes".
- **Spoken durations** (`siriSpokenDuration<minutes>`) are what Siri listens for inside `${spokenDuration}` and what the Shortcuts app lists. The title uses digits as that Language writes them (`1,5 Stunden`); `…Words` spells the amount out, and `…Alt` is another common way to say it ("half an hour"). Each must differ from the others.
- **FAQ answers** (`faq_<id>_a`) stay self-contained and searchable. Translate the whole answer.
- **Bemba, Kinyarwanda and Swahili** have less reference material. Lean on the existing file and JW publications in that language, and list the strings you're unsure of instead of guessing silently.

## Terminology

Use the words Jehovah's Witnesses use in that language. jw.org and the Watchtower Online Library in that language, plus congregation forms such as the monthly service report, are the reference. `CONTEXT.md` defines each concept.

Existing strings are evidence, not authority. Earlier machine translations left literal errors: Russian "Издатель" (a book publisher) and "министерство" (a government ministry), Russian "Отчет об обслуживании" and Japanese "サービスレポート" for Service Report, and Russian "Следовать за" for Follow Up. Don't copy errors like these. When the official term differs from the file's, use the official term in the strings you translate and list the keys that still use the wrong one in your report.

Concepts to get right:

- **publisher**: anyone who shares in the preaching work. **Kingdom Publisher** is the role name for a publisher who isn't a pioneer (the `publisher` key).
- **Roles**: Regular Pioneer, Regular Auxiliary (an auxiliary pioneer serving continuously), Special Pioneer, Circuit Overseer.
- **ministry**, **field service**, **preaching**: the preaching work, never a government department or clergy.
- **return visit**, **Bible study**, **Service Report**, **Service Year** (September through August), **Credit Time** (such as LDC or Bethel), **Kingdom Hall**, **congregation**.
- App concepts from `CONTEXT.md` (**Follow-up**, **Visit**, **Contact**, **Plan**, **Not at Home**) each get one consistent translation per locale.

## Store release notes

The App Store's "What's New" and Google Play's release notes share one text per language (see `../app-store-release/SKILL.md` and `docs/build.md`). Follow the rules above and keep every language within Play's 500 characters (count with `[...text].length`; the App Store allows 4,000). Say which platform a feature is for. App Store Connect's locale codes differ from the app's (`ja`, not `ja-JP`; `ar-SA` for Arabic, which Google Play calls `ar`). The in-app `updates.<version>.c<n>` strings are separate and go through the locale files like any other key.
