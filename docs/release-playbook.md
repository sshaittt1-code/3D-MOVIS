# HoloCinema TV Release Playbook

## Local Release Checklist
1. Verify the workspace is on the intended branch and the working tree is clean enough to release.
2. Update `release-manifest.json`:
   - bump `version`
   - bump `versionCode`
   - set `publishedAt`
   - refresh `notes`
3. Run:
   - `npm run quality:gate`
   - `npm run android:apk`
   - `npm run smoke:artifacts:local`
4. Confirm the generated APK exists:
   - `android/app/build/outputs/apk/debug/app-debug.apk`
5. Smoke-check on device or emulator:
   - Launch opens in `Movies -> Popular`
   - Posters are visible
   - Category switching works
   - `Series -> Seasons -> Episodes` works
   - Android TV Back behavior works
   - Telegram login/search/playback still works
   - Update prompt appears when a newer release manifest is available
   - Installing an update preserves favorites/history/Telegram session
6. Commit and push:
   - `git add .`
   - `git commit -m "<short Hebrew release note>"`
   - `git push`

## CI Release Checklist
The GitHub Actions workflow runs:
1. `npm ci`
2. `npm run quality:gate`
3. `npx cap sync android`
4. `./gradlew assembleDebug`
5. `npm run smoke:artifacts:local`
6. Uploads the APK artifact

Workflow file:
- `.github/workflows/build-tv-apk.yml`

## Expected Quality Gate
`npm run quality:gate` must prove:
- TypeScript passes
- Unit tests pass
- Web build passes
- Local backend feed smoke passes for:
  - `/api/movies`
  - `/api/series`
  - `/api/israeli`
- Local backend update smoke passes for:
  - `/api/update-manifest`
  - `/apk/latest.apk` after APK build

## OTA Contract
- `release-manifest.json` is the single source of truth for:
  - `version`
  - `versionCode`
  - `publishedAt`
  - `notes`
- The backend exposes:
  - `GET /api/update-manifest`
  - `GET /apk/latest.apk`
- The Android app downloads the APK and hands it off to the Android system installer.
- User data survives upgrades as long as:
  - package name stays the same
  - signing key stays the same

## Release Notes Guidance
Keep release notes short and product-facing:
- corridor/navigation improvements
- Android TV polish
- Telegram/player fixes
- performance/cache changes
- catalog/search changes

## Rollback Rule
If either `quality:gate` or `android:apk` fails, do not release.  
Fix the regression first, then rerun the full release path.
