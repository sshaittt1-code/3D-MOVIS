import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import cors from 'cors';
import path from 'node:path';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// In-memory storage for the session (in a real app, save to DB)
let sessionString = '';
let tgClient: TelegramClient | null = null;

// Auth state resolvers
let resolveCode: ((code: string) => void) | null = null;
let resolvePassword: ((pw: string) => void) | null = null;
let rejectLogin: ((err: any) => void) | null = null;

const getClient = async () => {
  if (tgClient) return tgClient;
  const apiId = parseInt(process.env.TG_API_ID || '0');
  const apiHash = process.env.TG_API_HASH || '';
  if (!apiId || !apiHash) throw new Error('Missing TG_API_ID or TG_API_HASH in environment variables');

  tgClient = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
    connectionRetries: 5,
  });
  await tgClient.connect();
  return tgClient;
};

// Start Login Flow
app.post('/api/tg/startLogin', async (req, res) => {
  try {
    const { phone } = req.body;
    const client = await getClient();
    
    // Reset resolvers
    resolveCode = null;
    resolvePassword = null;
    rejectLogin = null;

    // We don't await this completely here because it blocks waiting for code
    client.signInUser(
      { apiId: parseInt(process.env.TG_API_ID!), apiHash: process.env.TG_API_HASH! },
      {
        phoneNumber: phone,
        phoneCode: async () => {
          return new Promise((resolve) => { resolveCode = resolve; });
        },
        password: async () => {
          return new Promise((resolve) => { resolvePassword = resolve; });
        },
        onError: (err) => {
          if (rejectLogin) rejectLogin(err);
        }
      }
    ).then(() => {
      sessionString = (client.session as StringSession).save();
    }).catch(err => {
      console.error('Login error:', err);
    });

    // We send success immediately to let the client know to ask for the code
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Submit Code
app.post('/api/tg/submitCode', async (req, res) => {
  if (resolveCode) {
    resolveCode(req.body.code);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'No active login session waiting for code' });
  }
});

// Submit Password (2FA)
app.post('/api/tg/submitPassword', async (req, res) => {
  if (resolvePassword) {
    resolvePassword(req.body.password);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'No active login session waiting for password' });
  }
});

// Check Auth Status
app.get('/api/tg/status', async (req, res) => {
  try {
    if (!sessionString && !tgClient) {
      return res.json({ loggedIn: false });
    }
    const client = await getClient();
    const isAuth = await client.checkAuthorization();
    res.json({ loggedIn: isAuth });
  } catch (e) {
    res.json({ loggedIn: false });
  }
});

// Search for Movie
app.get('/api/tg/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });
    
    const client = await getClient();
    
    // Search globally across all dialogs for video files matching the query
    const result = await client.invoke(new Api.messages.SearchGlobal({
      q: query as string,
      filter: new Api.InputMessagesFilterVideo(),
      limit: 10,
      offsetRate: 0,
      offsetId: 0,
      offsetPeer: new Api.InputPeerEmpty(),
    }));

    const messages = (result as Api.messages.Messages).messages;
    const chats = (result as Api.messages.Messages).chats;
    
    // Map chat info for easier lookup
    const chatMap = new Map();
    chats.forEach(c => {
      if ('id' in c) chatMap.set(c.id.toString(), c);
    });

    const formattedResults = messages.map((m: any) => {
      const peerId = m.peerId?.channelId || m.peerId?.chatId || m.peerId?.userId;
      const chat = chatMap.get(peerId?.toString());
      
      // Try to extract a meaningful title from the message text or document attributes
      let title = m.message || 'Video File';
      if (m.media && m.media.document) {
        const attr = m.media.document.attributes.find((a: any) => a.className === 'DocumentAttributeFilename');
        if (attr) title = attr.fileName;
      }

      return {
        id: m.id,
        peerId: peerId?.toString(),
        title: title.substring(0, 100) + (title.length > 100 ? '...' : ''),
        chatName: chat ? (chat.title || chat.username || 'Unknown Chat') : 'Unknown Chat',
        date: m.date,
        size: m.media?.document?.size ? (m.media.document.size / (1024 * 1024)).toFixed(2) + ' MB' : 'Unknown Size',
      };
    });

    res.json({ results: formattedResults });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stream Video
app.get('/api/tg/stream/:peerId/:messageId', async (req, res) => {
  try {
    const client = await getClient();
    const peerId = req.params.peerId;
    const messageId = parseInt(req.params.messageId);

    // Get the specific message
    const messages = await client.getMessages(peerId, { ids: [messageId] });
    if (!messages || messages.length === 0) return res.status(404).send('Message not found');
    const message = messages[0];

    if (!message.media) return res.status(404).send('No media found');

    res.setHeader('Content-Type', 'video/mp4');
    
    // Note: This is a basic streaming implementation.
    // GramJS iterDownload fetches chunks. We pipe them to the response.
    // It does not support HTTP Range requests natively, so seeking may not work perfectly.
    const stream = client.iterDownload({
      file: message.media,
      requestSize: 1024 * 1024, // 1MB chunks
    });

    for await (const chunk of stream) {
      res.write(chunk);
    }
    res.end();
  } catch (e: any) {
    console.error('Streaming error:', e);
    if (!res.headersSent) res.status(500).send(e.message);
  }
});

// Search for Subtitles
app.get('/api/tg/search-subtitles', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query' });
    
    const client = await getClient();
    
    // Search globally for .srt files matching the movie
    const result = await client.invoke(new Api.messages.SearchGlobal({
      q: `${query} srt`,
      filter: new Api.InputMessagesFilterDocument(),
      limit: 5,
      offsetRate: 0,
      offsetId: 0,
      offsetPeer: new Api.InputPeerEmpty(),
    }));

    const messages = (result as Api.messages.Messages).messages;
    const formattedResults = messages.map((m: any) => {
      const peerId = m.peerId?.channelId || m.peerId?.chatId || m.peerId?.userId;
      let title = 'Subtitle File';
      if (m.media && m.media.document) {
        const attr = m.media.document.attributes.find((a: any) => a.className === 'DocumentAttributeFilename');
        if (attr) title = attr.fileName;
      }
      return {
        id: m.id,
        peerId: peerId?.toString(),
        title,
      };
    }).filter(r => r.title.toLowerCase().includes('.srt'));

    res.json({ results: formattedResults });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stream and Convert Subtitle (SRT to VTT)
app.get('/api/tg/subtitle/:peerId/:messageId', async (req, res) => {
  try {
    const client = await getClient();
    const peerId = req.params.peerId;
    const messageId = parseInt(req.params.messageId);

    const messages = await client.getMessages(peerId, { ids: [messageId] });
    if (!messages || messages.length === 0) return res.status(404).send('Message not found');
    const message = messages[0];

    if (!message.media) return res.status(404).send('No media found');

    const buffer = await client.downloadMedia(message.media, { workers: 1 });
    if (!buffer) return res.status(500).send('Failed to download subtitle');

    // Convert SRT to VTT (HTML5 video requires VTT)
    const srtText = buffer.toString('utf8');
    let vttText = 'WEBVTT\n\n';
    vttText += srtText
      .replace(/\r\n|\r|\n/g, '\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(vttText);
  } catch (e: any) {
    console.error('Subtitle error:', e);
    res.status(500).send(e.message);
  }
});

// Fetch Movies (TMDB or Fallback)
app.get('/api/movies', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (tmdbKey) {
      const response = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}&language=he-IL&page=1`);
      const data = await response.json();
      const movies = data.results.map((m: any) => ({
        id: m.id,
        title: m.title,
        genre: 'סרט',
        rating: m.vote_average,
        popularity: m.popularity,
        poster: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
        trailer: '', 
        desc: m.overview || 'אין תיאור זמין בעברית.'
      }));
      return res.json({ movies });
    }
    
    // Fallback Hebrew movies (High quality posters from TMDB)
    const fallback = [
      { id: 1, title: 'התחלה (Inception)', genre: 'מדע בדיוני', rating: 8.8, popularity: 95, poster: 'https://image.tmdb.org/t/p/w500/8Z8dpt8NqCvxu4XTEcXCFCISCE0.jpg', trailer: 'https://www.youtube.com/embed/YoHD9XEInc0', desc: 'גנב שגונב סודות תאגידיים באמצעות טכנולוגיית שיתוף חלומות מקבל משימה הפוכה של שתילת רעיון במוחו של מנכ"ל.' },
      { id: 2, title: 'בין כוכבים (Interstellar)', genre: 'מדע בדיוני', rating: 8.6, popularity: 90, poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MvrIdlsR.jpg', trailer: 'https://www.youtube.com/embed/zSWdZVtXT7E', desc: 'צוות חוקרים נוסע דרך חור תולעת בחלל בניסיון להבטיח את הישרדותה של האנושות.' },
      { id: 3, title: 'מטריקס (The Matrix)', genre: 'מדע בדיוני', rating: 8.7, popularity: 92, poster: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', trailer: 'https://www.youtube.com/embed/vKQi3bBA1y8', desc: 'כאשר זרה יפהפייה מובילה את האקר המחשבים ניאו לעולם תחתון אסור, הוא מגלה את האמת המזעזעת - החיים שהוא מכיר הם הונאה מורכבת של אינטליגנציה קיברנטית מרושעת.' },
      { id: 4, title: 'אווטאר (Avatar)', genre: 'פעולה', rating: 7.8, popularity: 85, poster: 'https://image.tmdb.org/t/p/w500/kyeqWdyKINLSywicWSXb390iEQO.jpg', trailer: 'https://www.youtube.com/embed/5PSNL1qE6VY', desc: 'נחת משותק שנשלח לירח פנדורה במשימה ייחודית נקרע בין מילוי פקודותיו לבין הגנה על העולם שהוא מרגיש שהוא ביתו.' },
      { id: 5, title: 'חולית (Dune)', genre: 'מדע בדיוני', rating: 8.0, popularity: 88, poster: 'https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg', trailer: 'https://www.youtube.com/embed/n9xhKvBWcl4', desc: 'משפחת אצולה מסתבכת במלחמה על השליטה בנכס היקר ביותר בגלקסיה.' },
      { id: 6, title: 'בלייד ראנר 2049', genre: 'מדע בדיוני', rating: 8.0, popularity: 82, poster: 'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg', trailer: 'https://www.youtube.com/embed/gCcx85zbxz4', desc: 'גילויו של סוד קבור זמן רב מוביל בלייד ראנר צעיר לאתר את ריק דקארד, שנעדר כבר שלושים שנה.' },
      { id: 7, title: 'מקס הזועם: כביש הזעם', genre: 'פעולה', rating: 8.1, popularity: 89, poster: 'https://image.tmdb.org/t/p/w500/8tZYtuWezp8JbcsvHYO0O46tFbo.jpg', trailer: 'https://www.youtube.com/embed/hEJnMQG9lN8', desc: 'בשממה פוסט-אפוקליפטית, אישה מורדת בשליט עריץ בחיפוש אחר מולדתה.' },
      { id: 8, title: 'ספיידרמן: ממד העכביש', genre: 'אנימציה', rating: 8.4, popularity: 91, poster: 'https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg', trailer: 'https://www.youtube.com/embed/tg52up16eq0', desc: 'מיילס מוראלס הופך לספיידרמן של היקום שלו, וחייב לחבור לאנשי עכביש מממדים אחרים כדי לעצור איום על כל המציאויות.' },
      { id: 9, title: 'האביר האפל (The Dark Knight)', genre: 'פעולה', rating: 9.0, popularity: 98, poster: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', trailer: 'https://www.youtube.com/embed/EXeTwQWrcwY', desc: 'כאשר האיום המכונה הג\'וקר זורע הרס וכאוס על תושבי גותהאם, באטמן חייב לקבל על עצמו את אחד המבחנים הפסיכולוגיים והפיזיים הגדולים ביותר.' },
      { id: 10, title: 'הנוקמים: סוף המשחק', genre: 'פעולה', rating: 8.4, popularity: 96, poster: 'https://image.tmdb.org/t/p/w500/or06FN3Dka5tukK1e9sl16pB3iy.jpg', trailer: 'https://www.youtube.com/embed/TcMBFSGVi1c', desc: 'לאחר האירועים ההרסניים של מלחמת האינסוף, היקום נמצא בהריסות. בעזרת בני ברית שנותרו, הנוקמים מתאספים פעם נוספת כדי להפוך את פעולותיו של תאנוס.' },
      { id: 11, title: 'פרזיטים (Parasite)', genre: 'מותחן', rating: 8.5, popularity: 87, poster: 'https://image.tmdb.org/t/p/w500/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', trailer: 'https://www.youtube.com/embed/5xH0HfJHxYI', desc: 'חמדנות ואפליה מעמדית מאיימות על מערכת היחסים הסימביוטית שזה עתה נוצרה בין משפחת פארק העשירה לבין שבט קים חסר הכל.' },
      { id: 12, title: 'המסע המופלא (Spirited Away)', genre: 'אנימציה', rating: 8.6, popularity: 84, poster: 'https://image.tmdb.org/t/p/w500/39wmItIWsg5sZMyRU84vUqXExBv.jpg', trailer: 'https://www.youtube.com/embed/ByXuk9QqQkk', desc: 'במהלך מעבר משפחתה לפרברים, ילדה זועפת בת 10 נודדת לעולם שנשלט על ידי אלים, מכשפות ורוחות, ושבו בני אדם הופכים לחיות.' },
      { id: 13, title: 'פאודה (Fauda)', genre: 'ישראלי', rating: 8.3, popularity: 88, poster: 'https://image.tmdb.org/t/p/w500/8j12jctzB0XQGkE9B0n2PEnQk4.jpg', trailer: 'https://www.youtube.com/embed/3bOWJWQzMGE', desc: 'הסיפורים האנושיים משני צידי הסכסוך הישראלי-פלסטיני. סוכן ישראלי בכיר יוצא מפרישה כדי לצוד פעיל פלסטיני.' },
      { id: 14, title: 'שטיסל (Shtisel)', genre: 'ישראלי', rating: 8.6, popularity: 82, poster: 'https://image.tmdb.org/t/p/w500/1W1hA12R1XQ.jpg', trailer: 'https://www.youtube.com/embed/1W1hA12R1XQ', desc: 'משפחה חרדית המתגוררת בשכונה חרדית בירושלים מתמודדת עם אהבה, אובדן ושגרת חיי היומיום.' },
    ];
    res.json({ movies: fallback });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
