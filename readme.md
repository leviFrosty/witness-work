# WitnessWork

WitnessWork is the easy way for Jehovah's Witnesses to manage their field service priorities.

It's available on iOS, Android, and the web, built in TypeScript with React Native and Expo.

## Sponsor

Please consider donating if you have found WitnessWork helpful to you in your service & you have the means.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/leviwilkerson)

## View it live

[![App Store](https://img.shields.io/badge/App_Store-0D96F6?style=for-the-badge&logo=app-store&logoColor=white)](https://apps.apple.com/us/app/witnesswork/id6469723047)
[![Google Play](https://img.shields.io/badge/Google_Play-414141?style=for-the-badge&logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime)
[![Web](https://img.shields.io/badge/Web-2f9e44?style=for-the-badge&logo=googlechrome&logoColor=white)](https://app.witnesswork.app)

<div float="left">
<img src="./docs/screenshots/preview1.jpg" width="130">
<img src="./docs/screenshots/preview2.jpg" width="130">
<img src="./docs/screenshots/preview3.jpg" width="130">
<img src="./docs/screenshots/preview4.jpg" width="130">
<img src="./docs/screenshots/preview5.jpg" width="130">
<img src="./docs/screenshots/preview6.jpg" width="130">
</div>

## Languages 🌐

WitnessWork is available in 19 languages, translated with AI, including Arabic with a right-to-left layout. If a translation looks wrong, please [open an issue](https://github.com/leviFrosty/witness-work/issues/new) with the language, the screen, and the correct wording. Thank you!

## Building

Development setup (iOS and Android) and the production build process are documented in [docs/build.md](./docs/build.md). Production builds are intentionally done **locally** (`pnpm run build:prod-auto-submit`) rather than on EAS Build cloud services.

## Architecture

How the app, its backend [ww-api](https://github.com/leviFrosty/ww-api), and the services they use connect. Arrows point from the caller to what it calls; dashed arrows are pushes and background work.

[Open the diagram in Mermaid Live](https://mermaid.live/view#pako:eNp9Vm1T4zYQ_isa35c2KBQYKCTT6YxJQsnxkkzsO8qcOyDb60SNY3kkmTS9u__eleQkduEYPsRa6Vnt7vPsiq9eIlLw-l6Wi3WyYFKT8DIqCFFVPJesXJDB7Xh0HwZfIu9hARJICaLMgVQKyAPXBSj1IOQy8v4yKEL86RSPPnc6jU3CyrLTiQo-CcgB8YtUCp4-7yAPo8vXEFEQvQCyhtgg0cHh2u2ucfcQ13v86M9w5ge1C6aThblPUbLm6Rw0fgRccuNFL6So5gvruFyIAkjDDxRpVLQyn9764dVkdoee_dLk_Av5Q4g5fiiQLzwBtQth-hQ83g9cCHyQiyolQ8lfGhC7NEGoTZGQjOegnhvwm9Fj0ILfwAbp4AV6uMxFsiSBFtI6YEkiqkKTJWyaHvwwHAWh84HhEl9rUBrh05xtyLjQMJdcb4yHUooXUISRORQVb5fBuLrzp3Uwd6y84XqfBa5Vp9M8O_0UXNeXTu8Vnrwa3Nk7KrUgKeSYtWzFGYST2Wgfpk1rf4EJ1sElpq_2RXpNz-AKvdhiZTmT0FDg2Llfr7us5MTICWSjcqgIV-MAqaDkskpTDkYmKH9IyYBJRaMiBIn1EtJtJZLHQPwxJSghjfLJWVHwYk5Jzotlg8qhH_pffmrer9AJm1vqhseUDCvJYsx0Ev8NiYlldkLJzWf08HPtYoIerINrocmnMmXahY-kyS5qt8u4JJW1q1YXXU-2AniA2JBKFkJpW868UmTFSsKKlMRCd5MFoKYyyVZNH8E4rKn5X7MZH9iKimPqB-Qa8pIMACUlG9iRPxvUUmgcwF5hSKVx4IhQWMUfk4q9PJrd-7foZ1JpxdM3mi14ur29cxdNSihmhhBboH9Bii6WhXUlaLyd4xBZ4XjLmyk-XY-2-jNfVhdpKjFZbIkDSy_y2gTM6saewQv2CwyYxnOBlry0pAZVWQppUn0lWoOe1jWZIhXXYm7vK1i-0TxB8lG6c_xRlXyBTQsX4NSdPTpsgMlI2xcxS5ZYNYLiFLJ1HvkPPg9abfvRjNuwkoXSOG9qDo0MqNEAsRp4RYWbpuS3bvd3M8yNCX-IW47NEm96a1kLsAlAJTeXRl6ttZWMsbgv0j1849R2DBtb_Rg5NJa25Q2JquMxcdQ2VxZ3bmxtpkObayuntsEIo22ZDdprx87OhnF_izwz8yLvWz0VbV4IdEm4ube3OQTysRBiaUC2mmY_yZlSQ8jwgyPv5q3I-x_ik-wkjqnSUiyh_-Ek68HpKU1ELmT_wzGYvxYYB5TOhFzVcOhBAtkOfto7Ozo7fwe-tr1ag7MMLpJkB4aLs95R8g5YaRxNO2xydH6xw6a904uj7B0s_IOdhP1Rw9OjOMv2cf96fnqc9n4AN0qgyDetJezqt992jzR1jy3dvpjUvXfUkUZronb1a3ofUxQ0rfVFjU5pLVxXrv1ZozFXhr3N6ow6cVEjAmoUTLdaolut7koQFR71ViBXjKf4H9rXyMPhv8KHrh95KWSsynXkfcczrNLCvGVeX8sKqOfehiFnOFNXzvj9P-cDKOo) to zoom and pan.

```mermaid
flowchart TB
  subgraph CLIENTS["Where people use WitnessWork"]
    APP["`**WitnessWork app**
iOS + Android`"]
    WEB["`**WitnessWork on the web**
app.witnesswork.app`"]
    EXTRAS["`**Watch apps, widgets, Siri**
through the phone app`"]
  end

  subgraph PLATFORM["Apple / Google services"]
    P_SYNC["`**iCloud Drive / Google Drive**
sync files`"]
    P_KEYS["`**iCloud Keychain / Block Store**
account key`"]
    P_ATTEST["`**App Attest / Play Integrity**
proves a genuine app`"]
    P_MAPS["`**MapKit / Google Maps**`"]
    P_PUSH["`**APNs / FCM**
push delivery`"]
    P_STORE["`**App Store / Google Play**
purchases`"]
  end

  subgraph CF["Cloudflare"]
    API["`**ww-api Worker**
accounts, Cloud Sync, Buddies, Shared Cars,
Territories, Scribe AI, route planning, links`"]
    DATA[("`**ww-api storage**
D1, Durable Objects, R2, KV`")]
    OTA["`**Hot Updater**
over-the-air updates`"]
    WEBHOST["`**Web app host**
plus map and bot-check frames`"]
    SITE["`**witnesswork.app**
website + Help Center`"]
    SEARCH["`**Help Center search**
Workers AI`"]
  end

  subgraph EXTERNAL["Outside services"]
    S_LLM["`**OpenRouter**
zero-data-retention models`"]
    S_HERE["`**HERE**
addresses + routing`"]
    S_RC["`**RevenueCat + Stripe**
Supporter purchases`"]
    S_PH["`**PostHog**
analytics, flags, surveys`"]
    S_SENTRY["`**Sentry**
backend errors`"]
    S_WEBSVC["`**MapKit JS + Turnstile**
web map, bot check`"]
  end

  EXTRAS <--> APP
  APP --> API
  WEB --> API
  WEB --> WEBHOST
  APP --> OTA
  APP --> SITE
  APP --> SEARCH
  SEARCH -.-> SITE
  APP --> PLATFORM
  CLIENTS --> S_PH
  APP --> S_RC
  WEBHOST --> S_WEBSVC
  API --> DATA
  API --> S_LLM
  API --> S_HERE
  API --> S_RC
  API --> S_SENTRY
  API -.->|"push"| P_PUSH
  S_RC --> P_STORE
  S_RC -.->|"webhook"| API

  classDef client fill:#b2f2bb,stroke:#2f9e44,color:#1e1e1e
  classDef platform fill:#e9ecef,stroke:#495057,color:#1e1e1e
  classDef worker fill:#ffe8cc,stroke:#e8590c,color:#1e1e1e
  classDef state fill:#ffc078,stroke:#d9480f,color:#1e1e1e
  classDef external fill:#d0bfff,stroke:#6741d9,color:#1e1e1e
  class APP,WEB,EXTRAS client
  class P_SYNC,P_KEYS,P_ATTEST,P_MAPS,P_PUSH,P_STORE platform
  class API,OTA,WEBHOST,SITE,SEARCH worker
  class DATA state
  class S_LLM,S_HERE,S_RC,S_PH,S_SENTRY,S_WEBSVC external
```

## License

WitnessWork © 2023-2026 by Levi Wilkerson is licensed under [Attribution-NonCommercial 4.0 International](./LICENSE)
