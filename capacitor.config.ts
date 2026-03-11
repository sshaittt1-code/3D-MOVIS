import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.holocinema.tv',
  appName: 'HoloCinema TV',
  webDir: 'dist',
  server: {
    // Correct URL for your GitHub Pages
    url: 'https://shaittt1-code.github.io/3D-MOVIS-main/',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
