# תכנית מימוש: אופטימיזציית טעינת פוסטרים

## סקירה כללית

מימוש בשלושה שלבים עיקריים: (1) מדיניות TTL דינמית ב-`categoryCache.ts`, (2) שיפורי `TextureManager.ts`, (3) טעינה מקבילית ו-prefetch ב-`App.tsx`.

## משימות

- [x] 1. הוספת `getCacheTTL` ועדכון `getCategoryCacheEntry` ב-`categoryCache.ts`
  - הוסף פונקציה `getCacheTTL(category: string): number` עם הלוגיקה המלאה לפי טבלת ה-TTL
  - עדכן את `getCategoryCacheEntry` לקבל פרמטר `category` אופציונלי ולהשתמש ב-`getCacheTTL` כברירת מחדל
  - ייצא את `getCacheTTL` מהמודול
  - _דרישות: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [-]* 1.1 כתוב בדיקת מאפיין עבור TTL=0 לקטגוריה אקראית
    - **Property 1: TTL אפס עבור קטגוריה אקראית**
    - **Validates: Requirements 1.2, 6.4**
    - `Feature: poster-loading-optimization, Property 1: TTL=0 for random category`
    - השתמש ב-fast-check: `fc.constant('random')` → `getCacheTTL` מחזיר 0

  - [~]* 1.2 כתוב בדיקת מאפיין עבור מונוטוניות TTL לפי שנה
    - **Property 2: TTL עולה עם ותק הקטגוריה**
    - **Validates: Requirements 1.5, 1.6**
    - `Feature: poster-loading-optimization, Property 2: TTL monotonicity for year categories`
    - השתמש ב-fast-check: `fc.integer({ min: 1900, max: 2019 })` → TTL של שנה ישנה ≥ TTL של שנה חדשה יותר

  - [~]* 1.3 כתוב בדיקת מאפיין עבור getCategoryCacheEntry עם TTL=0
    - **Property 3: getCategoryCacheEntry מחזיר null עבור TTL=0**
    - **Validates: Requirements 1.7, 6.4**
    - `Feature: poster-loading-optimization, Property 3: getCategoryCacheEntry returns null for TTL=0`
    - השתמש ב-fast-check: שמור רשומה עם `category='random'`, ודא שהפונקציה מחזירה `null` תמיד


- [~] 2. שיפורי `TextureManager.ts`
  - שנה `maxCacheSize` מ-140 ל-200
  - שנה ברירת המחדל של `concurrency` ב-`prefetch` מ-4 ל-6
  - הוסף מתודה `prefetchPriority(urls: string[], concurrency = 8): Promise<void>`
  - _דרישות: 5.1, 5.2, 5.3, 5.4_

  - [~]* 2.1 כתוב בדיקת מאפיין עבור LRU eviction ושמירת גודל מטמון
    - **Property 5: LRU eviction שומר על גודל מטמון ≤ 200**
    - **Validates: Requirements 5.1, 5.3**
    - `Feature: poster-loading-optimization, Property 5: cache size invariant`
    - השתמש ב-fast-check: טען N > 200 טקסטורות (mock), ודא `cache.size <= 200`

  - [~]* 2.2 כתוב בדיקת מאפיין עבור prefetch שמדלג על URLs קיימים
    - **Property 4: prefetch מדלג על URLs שכבר במטמון**
    - **Validates: Requirements 3.4**
    - `Feature: poster-loading-optimization, Property 4: prefetch skips cached URLs`
    - השתמש ב-fast-check: טען URLs מראש, קרא ל-`prefetch` עם אותם URLs + חדשים, ודא שה-cached לא נטענו שוב

- [~] 3. נקודת ביקורת — ודא שכל הבדיקות עוברות
  - הרץ `vitest run src/utils/categoryCache.test.ts src/utils/TextureManager.test.ts`
  - ודא שאין שגיאות TypeScript בקבצים שנערכו


- [~] 4. טעינה מקבילית בהפעלה ב-`App.tsx`
  - הוסף state `prefetchedCategories` לשמירת תוצאות הטעינה המקבילית
  - צור פונקציה `prefetchAllCategories()` שמשתמשת ב-`Promise.all` לטעינת 20 פוסטרים ראשונים לכל קטגוריה
  - קרא ל-`prefetchAllCategories()` ב-`useEffect` ריק (mount בלבד)
  - אחרי כל טעינת batch, קרא ל-`textureManager.prefetch(items.slice(0, 10).map(i => i.poster), 6)`
  - _דרישות: 2.1, 2.2, 2.3, 2.4, 3.1_

- [~] 5. Prefetch אוטומטי בשינוי קטגוריה ב-`App.tsx`
  - הוסף `useEffect` שמאזין לשינויים ב-`displayMovies` וקורא ל-`textureManager.prefetch` עם ה-poster URLs של הפריטים המוצגים
  - _דרישות: 3.2_

- [~] 6. טעינה מוקדמת של האצווה הבאה ב-`App.tsx`
  - הוסף state `isPrefetchingNext: boolean`
  - שנה את סף הטעינה מ-90% ל-75%
  - הוסף guard: אם `isPrefetchingNext` הוא `true`, אל תפעיל טעינה נוספת
  - אחרי שהאצווה הבאה נטענת, קרא ל-`textureManager.prefetch` עם ה-poster URLs החדשים
  - _דרישות: 4.1, 4.2, 4.3, 4.4_

  - [~]* 6.1 כתוב בדיקת מאפיין עבור guard של isPrefetchingNext
    - **Property 6: isPrefetchingNext מונע בקשות כפולות**
    - **Validates: Requirements 4.2**
    - `Feature: poster-loading-optimization, Property 6: isPrefetchingNext guard`
    - בדוק שכאשר `isPrefetchingNext=true`, לא נוצרת בקשת רשת נוספת

- [~] 7. מצב אקראי ללא מטמון ב-`App.tsx`
  - כאשר `selectedCategory === 'random'`: דלג על המטמון, צור seed חדש בכל שינוי עמוד
  - הוסף אינדיקטור "מערבב..." שמוצג כאשר `selectedCategory === 'random' && isLoading`
  - _דרישות: 6.1, 6.2, 6.3_

- [~] 8. נקודת ביקורת סופית — ודא שכל הבדיקות עוברות
  - הרץ `vitest run` לכל הבדיקות
  - ודא שאין שגיאות TypeScript בכל הקבצים שנערכו

## הערות

- משימות המסומנות ב-`*` הן אופציונליות וניתן לדלג עליהן לטובת MVP מהיר יותר
- כל משימה מפנה לדרישות ספציפיות לצורך מעקב
- נקודות הביקורת מבטיחות אימות מצטבר לאורך המימוש
- בדיקות המאפיינים משתמשות ב-fast-check עם מינימום 100 איטרציות לכל מאפיין
