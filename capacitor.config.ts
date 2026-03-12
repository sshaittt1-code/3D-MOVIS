import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.holocinema.tv',
  appName: 'HoloCinema TV',
  webDir: 'dist',
  server: {
    url: 'https://ais-pre-zgturhw4row6gtvlf3jbq3-185322315707.europe-west2.run.app',
    allowNavigation: [
      'ais-pre-zgturhw4row6gtvlf3jbq3-185322315707.europe-west2.run.app',
      '*.run.app',
      '*.google.com'
    ],
    cleartext: true
  },
  android: {
    allowMixedContent: true,
    captureInput: true
  }
};

export default config;
