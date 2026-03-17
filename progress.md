Original prompt: PLEASE IMPLEMENT THIS PLAN: תוכנית דור הבא למסדרון: Full 3D מהיר עם אשליות IMAX קלות

- Started implementing the new corridor renderer.
- Added corridor shell primitives and slot virtualization helpers.
- Current focus: wire the new shell into App.tsx, verify thumb-first behavior, and run visual smoke.
- Wired the shell, focus overlay, tier budgets, and slot-based texture intents into App.tsx.
- Added a lightweight poster slot component and upgraded TextureManager to mark textures as updated after decode.
- Local Playwright smoke reached the new corridor shell and sidebar with no console errors.
- Headless Chromium still shows white poster surfaces even when slot texture state reports loaded; likely a headless/WebGL capture artifact or a remaining texture/material issue to verify on device.
