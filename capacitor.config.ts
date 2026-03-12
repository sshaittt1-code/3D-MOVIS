import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.holocinema.tv',
  appName: 'HoloCinema TV',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    // Allow the app to be installed on Android TV
    allowMixedContent: true
  }
};

export default config;
