import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);

// Use crypto for simple ids
import crypto from 'crypto';

const SESSION_FILE = path.join(process.cwd(), 'tg_session.txt');

// Serve Latest Built APK for OTA Updates
app.use('/apk', express.static(path.join(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'debug')));

// Active Connected Clients
const activeClients = new Map<string, TelegramClient>();

// Login Sessions
interface LoginSession {
  client: TelegramClient;
  resolveCode: ((code: string) => void) | null;
  resolvePassword: ((pw: string) => void) | null;
  rejectLogin: ((err: any) => void) | null;
  stage: 'none' | 'pending_code' | 'pending_password' | 'success' | 'error';
  errorMsg: string;
}
const loginSessions = new Map<string, LoginSession>();

const getClientParam = async (sessionStr: string) => {
  if (!sessionStr) throw new Error("Missing Telegram Session! Please login on your TV.");
  if (activeClients.has(sessionStr)) return activeClients.get(sessionStr)!;
  
  const apiId = 30431141;
  const apiHash = 'f702b44f4c8d695e4116b17df4408221';

  const client = new TelegramClient(new StringSession(sessionStr), apiId, apiHash, {
    connectionRetries: 5,
  });
  await client.connect();
  activeClients.set(sessionStr, client);
  return client;
};

// Start Login Flow
app.post('/api/tg/startLogin', async (req, res) => {
  try {
    const { phone } = req.body;
    const loginId = crypto.randomUUID();
    
    const client = new TelegramClient(new StringSession(''), 30431141, 'f702b44f4c8d695e4116b17df4408221', { connectionRetries: 5 });
    await client.connect();
    
    const sessionObj: LoginSession = {
      client,
      resolveCode: null,
      resolvePassword: null,
      rejectLogin: null,
      stage: 'pending_code',
      errorMsg: ''
    };
    loginSessions.set(loginId, sessionObj);

    // We don't await this completely here because it blocks waiting for code
    client.signInUser(
      { apiId: 30431141, apiHash: 'f702b44f4c8d695e4116b17df4408221' },
      {
        phoneNumber: phone,
        phoneCode: async () => {
          sessionObj.stage = 'pending_code';
          return new Promise((resolve) => { sessionObj.resolveCode = resolve; });
        },
        password: async () => {
          sessionObj.stage = 'pending_password';
          return new Promise((resolve) => { sessionObj.resolvePassword = resolve; });
        },
        onError: (err) => {
          sessionObj.stage = 'error';
          sessionObj.errorMsg = err.message;
          if (sessionObj.rejectLogin) sessionObj.rejectLogin(err);
        }
      }
    ).then(() => {
      sessionObj.stage = 'success';
    }).catch(err => {
      sessionObj.stage = 'error';
      sessionObj.errorMsg = err.message;
      console.error('Login error:', err);
    });

    res.json({ success: true, loginId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Submit Code
app.post('/api/tg/submitCode', async (req, res) => {
  const { loginId, code } = req.body;
  const sessionObj = loginSessions.get(loginId);
  if (!sessionObj) return res.status(404).json({ error: 'Login session expired or not found.' });

  if (sessionObj.resolveCode) {
    sessionObj.resolveCode(code);
    
    // Wait for the signInUser promise to progress to either success, error, or password state
    let attempts = 0;
    while (sessionObj.stage === 'pending_code' && attempts < 30) {
      await new Promise(r => setTimeout(r, 200));
      attempts++;
    }

    if (sessionObj.stage === 'pending_password') {
      res.json({ requiresPassword: true });
    } else if (sessionObj.stage === 'success') {
      const finalSessionStr = (sessionObj.client.session as StringSession).save() as unknown as string;
      activeClients.set(finalSessionStr, sessionObj.client);
      loginSessions.delete(loginId);
      res.json({ success: true, sessionString: finalSessionStr });
    } else {
      res.status(400).json({ error: sessionObj.errorMsg || 'Failed to verify code' });
    }
  } else {
    res.status(400).json({ error: 'Not waiting for code' });
  }
});

// Submit Password (2FA)
app.post('/api/tg/submitPassword', async (req, res) => {
  const { loginId, password } = req.body;
  const sessionObj = loginSessions.get(loginId);
  if (!sessionObj) return res.status(404).json({ error: 'Login session expired or not found.' });

  if (sessionObj.resolvePassword) {
    sessionObj.resolvePassword(password);
    
    let attempts = 0;
    while (sessionObj.stage === 'pending_password' && attempts < 30) {
      await new Promise(r => setTimeout(r, 200));
      attempts++;
    }

    if (sessionObj.stage === 'success') {
      const finalSessionStr = (sessionObj.client.session as StringSession).save() as unknown as string;
      activeClients.set(finalSessionStr, sessionObj.client);
      loginSessions.delete(loginId);
      res.json({ success: true, sessionString: finalSessionStr });
    } else {
      res.status(400).json({ error: sessionObj.errorMsg || 'Failed to verify password' });
    }
  } else {
    res.status(400).json({ error: 'Not waiting for password' });
  }
});

// Logout
app.post('/api/tg/logout', async (req, res) => {
  try {
    const sessionStr = req.headers['x-tg-session'] as string;
    if (sessionStr) {
       const client = activeClients.get(sessionStr);
       if (client) {
         await client.invoke(new Api.auth.LogOut());
         activeClients.delete(sessionStr);
       }
    }
    res.json({ success: true });
  } catch (e: any) {
    res.json({ success: true });
  }
});

// Check Auth Status
app.get('/api/tg/status', async (req, res) => {
  try {
    const sessionStr = req.headers['x-tg-session'] as string;
    if (!sessionStr) return res.json({ loggedIn: false });
    const client = await getClientParam(sessionStr);
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
    
    const sessionStr = req.headers['x-tg-session'] as string;
    const client = await getClientParam(sessionStr);
    
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

// Stream Video with Range Support (Buffering)
app.get('/api/tg/stream/:peerId/:messageId', async (req, res) => {
  try {
    const sessionStr = req.query.session as string || req.headers['x-tg-session'] as string;
    const client = await getClientParam(sessionStr);
    const peerId = req.params.peerId;
    const messageId = parseInt(req.params.messageId);

    const messages = await client.getMessages(peerId, { ids: [messageId] });
    if (!messages || messages.length === 0) return res.status(404).send('Message not found');
    const message = messages[0];

    if (!message.media || !('document' in message.media)) return res.status(404).send('No video media found');

    const fileSize = (message.media.document as any).size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });

      const stream = client.iterDownload({
        file: message.media,
        offset: start as any,
        limit: chunksize,
        requestSize: 1024 * 1024, // 1MB chunks
      });

      for await (const chunk of stream) {
        res.write(chunk);
      }
      res.end();
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      });

      const stream = client.iterDownload({
        file: message.media,
        requestSize: 1024 * 1024,
      });

      for await (const chunk of stream) {
        res.write(chunk);
      }
      res.end();
    }
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
    
    const sessionStr = req.headers['x-tg-session'] as string;
    const client = await getClientParam(sessionStr);
    
    // Search globally for Hebrew .srt files matching the movie
    const result = await client.invoke(new Api.messages.SearchGlobal({
      q: `${query} תרגום`,
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
    const sessionStr = req.query.session as string || req.headers['x-tg-session'] as string;
    const client = await getClientParam(sessionStr);
    const peerId = req.params.peerId;
    const messageId = parseInt(req.params.messageId);

    const messages = await client.getMessages(peerId, { ids: [messageId] });
    if (!messages || messages.length === 0) return res.status(404).send('Message not found');
    const message = messages[0];

    if (!message.media) return res.status(404).send('No media found');

    const buffer = await client.downloadMedia(message.media, { });
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
      // Fetch 5 pages to get 100 unique movies
      const pages = [1, 2, 3, 4, 5];
      const fetchPromises = pages.map(page => 
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}&language=he-IL&page=${page}`).then(res => res.json())
      );
      
      const results = await Promise.all(fetchPromises);
      const allMovies = results.flatMap(data => data.results || []);

      const movies = allMovies.map((m: any) => ({
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
  // OTA Version Check
  app.get('/api/version', (req, res) => {
    res.json({
      version: '1.0.4',
      date: '13 במרץ 2026',
      message: 'עדכון מערכת רחב: כל משתמש כעת מנהל חיבור פרטי לטלגרם על גבי הענן בשמירה מקומית! תוקנו שלל באגים של תנועת השלט עבור כפתורים והוספת מקורות.'
    });
  });

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
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
