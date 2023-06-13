module.exports = {
  expo: {
    extra: {
      eas: {
        projectId: "a67257dc-2fb8-4942-97f2-e9364b80d318",
      },
    },
    name: "JW Time",
    slug: "jw-time",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./src/assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./src/assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    assetBundlePatterns: ["**/*"],
    hooks: {
      postPublish: [
        {
          file: "sentry-expo/upload-sourcemaps",
          config: {
            organization: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
          },
        },
      ],
    },
    ios: {
      bundleIdentifier: "com.leviWilkerson.jw-time",
      supportsTablet: true,
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.leviWilkerson.jw_time",
      adaptiveIcon: {
        foregroundImage: "./src/assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
    },
    web: {
      favicon: "./src/assets/favicon.png",
    },
    plugins: ["expo-localization", "sentry-expo"],
  },
};
