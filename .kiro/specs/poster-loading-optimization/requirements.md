# מסמך דרישות: אופטימיזציית טעינת פוסטרים

## מבוא

פיצ'ר זה משפר את מהירות טעינת הפוסטרים ב-HoloCinema TV. כיום הפוסטרים נטענים לאט: קטגוריות נטענות בסדרה (אחת אחרי השנייה), ה-`TextureManager` תומך ב-`prefetch()` אך הפונקציה לא נקראת, וכל הקטגוריות משתמשות ב-TTL אחיד של 15 דקות — כולל מצב "אקראי" שצריך תמיד לרענן. הפיצ'ר מוסיף טעינה מקבילית בהפעלה, prefetch חכם של תמונות, טעינה מוקדמת של האצווה הבאה, ומדיניות TTL דינמית לפי סוג קטגוריה.

## מילון מונחים

- **App**: אפליקציית HoloCinema TV (React + Vite + Capacitor)
- **CategoryCache**: מודול ניהול מטמון הקטגוריות (`src/utils/categoryCache.ts`)
- **TextureManager**: מודול ניהול טעינת טקסטורות/תמונות (`src/utils/TextureManager.ts`)
- **Poster**: תמונת כרזה של סרט או סדרה המוצגת במסדרון התלת-ממדי
- **Category**: קטגוריית תוכן (popular, trending, random, שנה ספציפית וכו')
- **Batch**: אצווה של פריטים הנטענת בבקשה אחת לשרת
- **Prefetch**: טעינה מוקדמת של משאבים לפני שהמשתמש מגיע אליהם
- **TTL**: זמן תפוגה של רשומת מטמון (Time To Live)
- **Seed**: מספר אקראי המשמש לקביעת סדר תוצאות מצב "אקראי"

---

## דרישות

### דרישה 1: מדיניות TTL דינמית לפי קטגוריה

**סיפור משתמש:** כמפתח, אני רוצה שמדיניות המטמון תתאים את עצמה לסוג הקטגוריה, כדי שתוכן דינמי יהיה תמיד עדכני ותוכן סטטי ייטען מהר יותר.

#### קריטריוני קבלה

1. THE CategoryCache SHALL expose a `getCacheTTL(category: string): number` function that returns the TTL in milliseconds for a given category name.
2. WHEN the category is `"random"`, THE CategoryCache SHALL return a TTL of `0` milliseconds (no caching).
3. WHEN the category is one of `"trending"`, `"new_releases"`, or `"recently_active"`, THE CategoryCache SHALL return a TTL of `5` minutes (300,000 milliseconds).
4. WHEN the category is `"popular"` or `"top_rated"`, THE CategoryCache SHALL return a TTL of `30` minutes (1,800,000 milliseconds).
5. WHEN the category represents a year value less than or equal to `2024`, THE CategoryCache SHALL return a TTL of `30` minutes (1,800,000 milliseconds).
6. WHEN the category represents a year value less than `2020`, THE CategoryCache SHALL return a TTL of `60` minutes (3,600,000 milliseconds).
7. WHEN `getCategoryCacheEntry` is called, THE CategoryCache SHALL use `getCacheTTL` to determine the TTL instead of the fixed constant `CATEGORY_CACHE_TTL_MS`.

---

### דרישה 2: טעינה מקבילית של קטגוריות בהפעלה

**סיפור משתמש:** כמשתמש, אני רוצה שהפוסטרים יופיעו מהר ברגע שהאפליקציה נפתחת, כדי שלא אצטרך לחכות בכל מעבר בין קטגוריות.

#### קריטריוני קבלה

1. WHEN the App mounts for the first time, THE App SHALL trigger parallel loading of the first 20 posters for all available categories simultaneously using `Promise.all`.
2. WHEN parallel category loading completes, THE App SHALL store the results in state per category so they are immediately available for display.
3. WHILE parallel category loading is in progress, THE App SHALL not block the UI or prevent the user from interacting with the corridor.
4. IF a category fails to load during parallel prefetch, THEN THE App SHALL log the error and continue loading the remaining categories without interruption.

---

### דרישה 3: Prefetch אוטומטי של תמונות פוסטרים

**סיפור משתמש:** כמשתמש, אני רוצה שתמונות הפוסטרים יהיו מוכנות לפני שאני מגיע אליהן, כדי שהמסדרון ייראה חלק ומהיר.

#### קריטריוני קבלה

1. WHEN a content batch is loaded for a category, THE App SHALL call `textureManager.prefetch()` with the poster URLs of the first 10 items in the batch.
2. WHEN the displayed category changes, THE App SHALL call `textureManager.prefetch()` with the poster URLs of the currently displayed items.
3. THE TextureManager SHALL support a `prefetch()` method that accepts an array of URLs and a concurrency limit, and loads them in batches without blocking the caller.
4. WHEN `prefetch()` is called with URLs already present in the texture cache, THE TextureManager SHALL skip those URLs and not reload them.

---

### דרישה 4: טעינה מוקדמת של האצווה הבאה

**סיפור משתמש:** כמשתמש, אני רוצה שהפוסטרים הבאים יהיו מוכנים לפני שאני מגיע לסוף הרשימה, כדי שהגלילה תהיה רציפה ללא עצירות.

#### קריטריוני קבלה

1. WHEN the user has scrolled past 75% of the currently loaded posters, THE App SHALL begin loading the next batch of 20 posters in the background.
2. WHILE the next batch is being loaded in the background, THE App SHALL not trigger an additional load request for the same batch.
3. WHEN the next batch finishes loading, THE App SHALL call `textureManager.prefetch()` with the poster URLs of the new batch.
4. IF there are no more posters to load (`hasMore` is false), THEN THE App SHALL not attempt to load additional batches.

---

### דרישה 5: שיפורי TextureManager

**סיפור משתמש:** כמפתח, אני רוצה ש-TextureManager יתמוך בנפח מטמון גדול יותר ובמקביליות גבוהה יותר, כדי שיותר פוסטרים יהיו זמינים בזיכרון בו-זמנית.

#### קריטריוני קבלה

1. THE TextureManager SHALL maintain a maximum cache size of `200` textures (increased from 140).
2. THE TextureManager SHALL support a default prefetch concurrency of `6` simultaneous requests (increased from 4).
3. WHEN the texture cache exceeds `200` entries, THE TextureManager SHALL evict the least-recently-used texture to maintain the limit.
4. THE TextureManager SHALL expose a `prefetchPriority()` method that accepts an array of URLs and loads them with higher concurrency (`8`) for images near the camera.
5. WHEN `prefetchPriority()` is called, THE TextureManager SHALL process the URLs before any pending standard prefetch requests.

---

### דרישה 6: מצב אקראי ללא מטמון

**סיפור משתמש:** כמשתמש, אני רוצה שמצב "אקראי/מיקס" תמיד יציג תוכן חדש ומגוון, כדי שהחוויה תהיה מפתיעה בכל פעם.

#### קריטריוני קבלה

1. WHEN the selected category is `"random"`, THE App SHALL skip the category cache entirely and always fetch fresh results from the server.
2. WHEN the selected category is `"random"`, THE App SHALL generate a new random seed for each page change.
3. WHEN the selected category is `"random"` and a new page is loaded, THE App SHALL display a dedicated loading indicator with the text "מערבב...".
4. IF the category cache TTL for `"random"` is `0`, THEN THE CategoryCache SHALL return `null` from `getCategoryCacheEntry` regardless of when the entry was stored.
