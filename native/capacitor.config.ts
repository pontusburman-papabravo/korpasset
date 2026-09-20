import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "se.korpasset.app",
  appName: "Körpasset",
  webDir: "www",
  server: {
    url: "https://korpasset.se/app",
    androidScheme: "https",
    iosScheme: "https",
    allowNavigation: ["korpasset.se", "www.korpasset.se"],
  },
  plugins: {
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },
  },
  ios: {
    scheme: "Körpasset",
    preferredContentMode: "mobile",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
