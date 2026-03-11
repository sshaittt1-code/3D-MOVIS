import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.holocinema.tv',
  appName: 'HoloCinema TV',
  webDir: 'dist',
  server: {
    // Correct URL for your GitHub Pages
    url: 'https://sshaittt1-code.github.io/3D-MOVIS/',
    cleartext: true
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
