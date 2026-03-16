# HoloCinema TV

HoloCinema TV is a cinematic Android TV media app built around an infinite 3D corridor.  
Users move through movie and series corridors, open title details, dive into seasons and episodes, and optionally connect Telegram to play sources through the native player flow.

## Core Product Shape
- Movies: launches by default into `Movies -> Popular`
- Series: supports nested corridors for `Series -> Seasons -> Episodes`
- Israeli: standalone catalog root
- Personal library: continue watching, favorites, history
- Search: unified search across catalog and personal library
- Telegram: login, source search, subtitles, playback handoff
- Android TV: leanback entry, remote-first navigation, immersive fullscreen

## Stack
- Frontend: React 19, Vite, TypeScript, Three.js, React Three Fiber, drei, Framer Motion
- Backend: Express + TypeScript + GramJS
- Android: Capacitor 8 + native Android shell
- Build: GitHub Actions produces a debug APK artifact on push

## Local Development
1. Install dependencies:
   `npm install`
2. Start the backend + Vite-integrated app:
   `npm run dev`
3. Open the app in the browser or sync/build Android when needed.

## Useful Scripts
- `npm run lint`
  Type-check the project.
- `npm run test`
  Runs unit tests for core app logic.
- `npm run build`
  Builds the web app into `dist/`.
- `npm run smoke:feeds`
  Runs feed smoke checks against an already running backend.
- `npm run smoke:feeds:local`
  Starts a local backend automatically and verifies the main catalog feeds.
- `npm run quality:gate`
  Runs lint, tests, build, and local feed smoke verification.
- `npm run android:apk`
  Builds the Android debug APK.
- `npm run release:verify`
  Runs the full local release gate, then builds the APK.

## Android APK
The debug APK is generated at:

`android/app/build/outputs/apk/debug/app-debug.apk`

## Backend Configuration
Optional environment variables:
- `TG_API_ID` / `TG_API_HASH`
  Telegram login and source access
- `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`
  Alternate Telegram env names
- `TMDB_API_KEY`
  Enriches catalogs when available
- `VITE_API_BASE` or `VITE_API_BASE_URL`
  Overrides the frontend API base when needed

## Release Flow
For a local release-quality pass:

1. `npm run quality:gate`
2. `npm run android:apk`

Or simply:

`npm run release:verify`

For the CI release path, see:

`.github/workflows/build-tv-apk.yml`

## Notes
- The project is optimized for Android TV and weaker streamers, so caching and staged poster loading are part of the runtime design.
- `.kiro/` is intentionally left out of product commits unless explicitly needed.
