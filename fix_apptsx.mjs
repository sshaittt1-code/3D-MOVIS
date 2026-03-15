import { readFileSync, writeFileSync } from 'fs';

let src = readFileSync('src/App.tsx', 'utf8');

// === Fix 1: TS always-truthy error in special categories sidebar (line ~761) ===
// The error is in the className condition check:
// Replace: genre === ('סדרות'||'מועדפים'||'צפיות אחרונות') && !activeGenreId && !navContext
// With:    genre === (key === 'סדרות' ? 'סדרות' : key === 'מועדפים' ? 'מועדפים' : 'צפיות אחרונות') && !navContext
const badCondition = `genre === ('\u05e1\u05d3\u05e8\u05d5\u05ea'||'\u05de\u05d5\u05e2\u05d3\u05e4\u05d9\u05dd'||'\u05e6\u05e4\u05d9\u05d5\u05ea \u05d0\u05d7\u05e8\u05d5\u05e0\u05d5\u05ea') && !activeGenreId && !navContext`;
const goodCondition = `genre === (key === '\u05e1\u05d3\u05e8\u05d5\u05ea' ? '\u05e1\u05d3\u05e8\u05d5\u05ea' : key === '\u05de\u05d5\u05e2\u05d3\u05e4\u05d9\u05dd' ? '\u05de\u05d5\u05e2\u05d3\u05e4\u05d9\u05dd' : '\u05e6\u05e4\u05d9\u05d5\u05ea \u05d0\u05d7\u05e8\u05d5\u05e0\u05d5\u05ea') && !navContext`;
if (src.includes(badCondition)) {
  src = src.replace(badCondition, goodCondition);
  console.log('✅ Fix 1: TS always-truthy condition fixed');
} else {
  console.log('⚠️  Fix 1: Pattern not found, already fixed or different text');
}

// === Fix 2: Add saveToHistory to play button ===
// Old: if (tgStatus !== 'loggedIn') { setTgStatus('phoneInput'); return; }\n                       setIsSearchingTg
// New: if (tgStatus !== 'loggedIn') { setTgStatus('phoneInput'); return; }\n                       saveToHistory(selectedMovie);\n                       setIsSearchingTg
const oldPlay = `if (tgStatus !== 'loggedIn') { setTgStatus('phoneInput'); return; }\n                       setIsSearchingTg(true); setShowCinemaScreen(true);`;
const newPlay = `if (tgStatus !== 'loggedIn') { setTgStatus('phoneInput'); return; }\n                       saveToHistory(selectedMovie);\n                       setIsSearchingTg(true); setShowCinemaScreen(true);`;
if (src.includes(oldPlay)) {
  src = src.replace(oldPlay, newPlay);
  console.log('✅ Fix 2: saveToHistory added to play button');
} else {
  console.log('⚠️  Fix 2: Pattern not found, may already have saveToHistory');
}

// === Fix 3: Add Search Overlay UI before the Telegram login <AnimatePresence> ===
const searchOverlay = `      {/* Search Overlay */}
      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute top-0 left-0 right-0 z-[55] bg-black/97 backdrop-blur-xl p-8 border-b border-[#00ffcc]/30 shadow-2xl">
            <div className="flex gap-4 max-w-4xl mx-auto">
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleTmdbSearch(); if (e.key === 'Escape') { setShowSearch(false); setSearchResults([]); setIsLocked(false); } }}
                placeholder="\u05d7\u05e4\u05e9 \u05e1\u05e8\u05d8 \u05d0\u05d5 \u05e1\u05d3\u05e8\u05d4..."
                dir="rtl"
                title="\u05e9\u05d3\u05d4 \u05d7\u05d9\u05e4\u05d5\u05e9"
                className="flex-1 text-2xl p-5 rounded-2xl bg-white/10 border border-white/20 focus:border-[#00ffcc] outline-none text-white placeholder-white/40 transition-all"
              />
              <button onClick={handleTmdbSearch} disabled={isSearchingTmdb} title="\u05d7\u05e4\u05e9" className="px-8 py-5 bg-[#00ffcc] text-black font-bold rounded-2xl text-xl disabled:opacity-50">
                {isSearchingTmdb ? <Loader2 className="animate-spin w-6 h-6" /> : '\ud83d\udd0d \u05d7\u05e4\u05e9'}
              </button>
              <button onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); setIsLocked(false); }} title="\u05d1\u05d9\u05d8\u05d5\u05dc" className="px-8 py-5 bg-white/10 hover:bg-white/20 rounded-2xl text-xl">\u05d1\u05d8\u05dc</button>
            </div>
            {searchResults.length > 0 && (
              <p className="text-center text-gray-400 mt-3 text-lg">{searchResults.length} \u05ea\u05d5\u05e6\u05d0\u05d5\u05ea \u05e2\u05d1\u05d5\u05e8 &quot;{searchQuery}&quot; \u2014 \u05e1\u05d2\u05d5\u05e8 \u05d5\u05e6\u05e4\u05d4 \u05d1\u05de\u05e1\u05d3\u05e8\u05d5\u05df</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Telegram login modal */}`;

const telegramMarker = `      {/* Telegram login modal */}`;
if (!src.includes('Search Overlay') && src.includes(telegramMarker)) {
  src = src.replace(telegramMarker, searchOverlay);
  console.log('✅ Fix 3: Search overlay added before Telegram login modal');
} else if (src.includes('Search Overlay')) {
  console.log('ℹ️  Fix 3: Search overlay already present');
} else {
  console.log('⚠️  Fix 3: Could not find Telegram login marker');
}

writeFileSync('src/App.tsx', src, 'utf8');
console.log('Done — src/App.tsx saved.');
