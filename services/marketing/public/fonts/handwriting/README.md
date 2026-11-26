# Handwriting fonts

The app shows the service report in a handwriting font. Kalam (the default) and Aref Ruqaa (Arabic) ship in the app. The fonts below are too big to ship in the app, so the app downloads the one for its language from here the first time it shows a report (`src/features/service-reports/lib/hostedHandwritingFonts.ts`), and stays on Kalam until it has.

Each file is copied unchanged from [google/fonts](https://github.com/google/fonts) at the commit in its folder name, with that font's license (`OFL.txt`, SIL Open Font License 1.1) beside it. The site caches `/fonts/*` forever, so never change a file in place: to update a font, add a new folder for the new commit and point the app at it, and keep the old folder for app versions that still use it.

| Folder                | Source                                                                                                                       | File                      | SHA-256                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| `gaegu-088df5c`       | [`ofl/gaegu` @ 088df5c](https://github.com/google/fonts/tree/088df5c822dacc8fad9dd64dbbe5649cd6830e99/ofl/gaegu)             | `Gaegu-Regular.ttf`       | `aa52c98336f7c62e2896fc8b12b56a75d5b476d88a2f104b0980f4f7ce0adfc3` |
|                       |                                                                                                                              | `Gaegu-Bold.ttf`          | `cc38a4af9506a45254d1ce07c589ec473d9e5f0be319e5a77b17c214903f8c1c` |
| `kleeone-130fcfb`     | [`ofl/kleeone` @ 130fcfb](https://github.com/google/fonts/tree/130fcfb0ff422fec96b335616b2ca99f91914792/ofl/kleeone)         | `KleeOne-Regular.ttf`     | `bf4063f030cc2ae6adf0a11424a1888e5c0eb4438f1f6d02f52294af868e9b3a` |
|                       |                                                                                                                              | `KleeOne-SemiBold.ttf`    | `b031ec426c23ca1143ef1f7d58bee7a79efe119ed654152f121c922202b303fd` |
| `mashanzheng-406197b` | [`ofl/mashanzheng` @ 406197b](https://github.com/google/fonts/tree/406197b91ff39a93061c2c2eeaee67ddf2ae1f0d/ofl/mashanzheng) | `MaShanZheng-Regular.ttf` | `6d2546bb189c732a8ca29af9e22457b152387d158aa459e4ac2ce1e51788b7fb` |
