import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.holocinema.tv',
  appName: 'HoloCinema TV',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    // Reverted to AI Studio live URL for full server-side support (Telegram, etc.)
    url: 'https://ais-pre-zgturhw4row6gtvlf3jbq3-185322315707.europe-west2.run.app',
    cleartext: true
  },
  android: {
    // Allow the app to be installed on Android TV
    allowMixedContent: true
  }
};

export default config;
