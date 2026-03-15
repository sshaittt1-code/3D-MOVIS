# Debugging and Fixing 3D UI Issues

- [x] Write implementation plan.
- [x] Implement camera rotation speed reduction in App.tsx.
- [x] Fix Raycaster accuracy (assign `userData` to both image and border meshes).
- [x] Fix Poster Image display (TextureLoader crossOrigin, reduce dark tint, permanently display title).
- [x] Fix Enter/OK key bug causing navigation to back out (prevent synthetic clicks leaking, perfect tv key handling).
- [x] Commit changes, run APK build.
- [x] Inform user to test APK fixes.
- [x] Analyze reference project (`D:\גרסאות גטאהב APK\holocinema-3d (3)`).
- [x] Merge poster fetching logic (fetch pages 1-5 from TMDB for 100 unique movies, disable repetition).
- [x] Fix Android Emulator local HTTP block (`cleartext: true`) and restore visual Error boundary.
- [x] Confirm Telegram MX Player logic is working properly.
- [x] Test the merged logic.
- [x] Commit and build APK.

# Telegram Login and Streaming Features
- [x] Implement Telegram Login UI in 3D (Phone Number -> Verification Code -> Select Source).
- [x] Add Resume/Start Over logic (save last playing position and prompt user).
- [ ] Launch MX Player with intent parameters for subtitles and resume.

# Refactoring Telegram Flow && Search Bugs
- [x] Fix the silent 2FA bug: synchronize backend `submitCode` and `loginStage` polling.
- [x] Implement Session Persistence to disk ([tg_session.txt](file:///d:/Stable-Diffusion/3D-MOVIS-main/tg_session.txt)).
- [x] Fix Search logic: clean up movie titles before querying Telegram (e.g. remove parentheses).
- [x] Change UI text from "צפה בטלגרם (MX Player)" to "לצפייה".
- [x] Add a Settings menu overlay to view auth status and disconnect.

# Android TV Hardware Optimization
- [x] Implement Frustum Culling & lazy loading of posters to prevent UI freezes on weak GPU hardware.
- [x] Add dynamic API Base URL input in settings so actual TVs can reach the local network host.
- [x] Optimize 3D [Text](file:///d:/Stable-Diffusion/3D-MOVIS-main/src/utils/TextureManager.ts#15-61) geometries (lazy render only the focused poster) to drop polygon overhead on TV.
- [x] Fix the frozen "שלח קוד אימות" button by adding loading states and accurate catch blocks.

# Native Media & OTA Features
- [x] Build an In-App React `<video>` component to replace the external MX Player integration.
- [x] Implement a live SRT to WebVTT converter endpoint in Node.js for perfect HTML5 subtitles.
- [x] Add an OTA version updater (`/api/version`) and APK download flow inside the app settings.

# Advanced Android TV Integrations
- [x] Create an isolated off-thread [TextureManager](file:///d:/Stable-Diffusion/3D-MOVIS-main/src/utils/TextureManager.ts#3-69) using `ImageBitmapLoader` so poster decoding never locks the TV UI thread.
- [x] Intercept the Native Hardware Back Button via `@capacitor/app` to route out of the 3D corridor instead of closing the app immediately.
- [x] Render a specialized 320x180 `banner.png` and link it in [AndroidManifest.xml](file:///d:/Stable-Diffusion/3D-MOVIS-main/android/app/src/main/AndroidManifest.xml) to fix the missing gray icon on the TV launcher.

# Hotfixes (Streamer QA)
- [x] Fix the API Connection issue ("לא מצליח להתחבר לשרת") that appeared in the latest build.
- [x] Add a prominent "Check for Updates" button to the settings menu for manual OTA triggers.
- [ ] Perform a systematic code audit to ensure robustness for the end-user.

# Hotfixes (Streamer QA 2)
- [x] Refactor backend [server.ts](file:///d:/Stable-Diffusion/3D-MOVIS-main/server.ts) to be Multi-Tenant:
  - Return `sessionString` to TV client upon successful login.
  - Accept `sessionString` in headers/body for all `/api/tg/*` routes.
  - Maintain an in-memory map of active `TelegramClient` instances per session.
- [x] Refactor TV [App.tsx](file:///d:/Stable-Diffusion/3D-MOVIS-main/src/App.tsx) for Multi-Tenant:
  - Re-add the Telegram Login screen to the TV.
  - Save the returned `sessionString` into `localStorage`.
  - Pass the token on all API requests.
- [x] Fix Modal Focus Trap (D-Pad stuck on 'X' button in Source list).
- [x] Enhance OTA `/api/version` to include Hebrew description, release date, and version info.

# Hotfixes (Streamer QA 3)
- [x] Fix missing `client.connect()` in POST `/api/tg/startLogin` logic to allow Telegram to send SMS codes.
- [x] Update frontend [App.tsx](file:///d:/Stable-Diffusion/3D-MOVIS-main/src/App.tsx) version identifier to sync with the backend release (`1.0.4`), preventing infinite OTA update prompts.
- [x] Design and implement native Android Capacitor APK Installer Plugin:
  - [x] Add standard [ApkInstallerPlugin.java](file:///d:/Stable-Diffusion/3D-MOVIS-main/android/app/src/main/java/com/holocinema/tv/ApkInstallerPlugin.java).
  - [x] Add native Intent invocation to replace generic Web browser routing.
  - [x] Implement Frontend Download progress mapping (`@capacitor/filesystem` download).

# Feature: Infinite Corridor + Series + Favorites (v1.0.5)
- [x] server.ts: Add `?page=` param to `/api/movies` for batched pagination.
- [x] server.ts: Add `GET /api/series` — TMDB TV discovery.
- [x] server.ts: Add `GET /api/series/:id` — seasons list.
- [x] server.ts: Add `GET /api/series/:id/season/:num` — episode list.
- [x] App.tsx: Add `navContext` navigation stack state for series/seasons/episodes drill-down.
- [x] App.tsx: Update `displayMovies` to handle navContext, 'סדרות', 'מועדפים' genres.
- [x] App.tsx: Add [handlePosterSelect](file:///d:/Stable-Diffusion/3D-MOVIS-main/src/App.tsx#502-509) that routes to Telegram search OR series nav.
- [x] App.tsx: Update back-button handler to pop navigation context.
- [x] App.tsx: Add breadcrumb UI bar showing current location in corridor hierarchy.
- [x] App.tsx: Add `favorites` state (localStorage persisted), [handleHeartToggle](file:///d:/Stable-Diffusion/3D-MOVIS-main/src/App.tsx#261-275).
- [x] App.tsx: Update [Poster](file:///D:/%D7%92%D7%A8%D7%A1%D7%90%D7%95%D7%AA%20%D7%92%D7%98%D7%90%D7%94%D7%91%20APK/holocinema-3d%20%283%29/src/App.tsx#104-228) component — add ❤ heart mesh + `heart_mesh` raycasting name.
- [x] App.tsx: Update [TVController](file:///d:/Stable-Diffusion/3D-MOVIS-main/src/App.tsx#53-162) — detect `heart_mesh` intersects, fire `onHeartToggle`.
- [x] App.tsx: Add infinite pagination — detect camera near end of corridor, fetch more.
- [x] Build APK and push to GitHub.

# Feature: Search, Watch History, Genres, Ratings (v1.0.6)
- [/] server.ts: Bump version to `1.0.5` (stays in sync with App.tsx `CURRENT_VERSION`).
- [ ] server.ts: Add `GET /api/search?q=&type=all|movie|tv` — TMDB multi-search.
- [ ] server.ts: Add `GET /api/genres` — list of TMDB genre IDs+Hebrew names.
- [ ] server.ts: Update `/api/movies` to support `?genre_id=` TMDB numeric filter.
- [ ] App.tsx: Add in-app search overlay — input + results displayed as corridor.
- [ ] App.tsx: watch history — save to localStorage when video plays; new 'צפיות אחרונות' genre.
- [ ] App.tsx: Genre category expansion — dynamic list from `/api/genres` with Hebrew names.
- [ ] App.tsx: Star rating — show ★ stars as 3D text above title when poster is focused.
- [ ] Build APK and push to GitHub.
