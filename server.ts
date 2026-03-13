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

// Fetch Movies with pagination (page=1 → TMDB pages 1-5, page=2 → 6-10, etc.)
app.get('/api/movies', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    const batchNum = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const startTmdbPage = (batchNum - 1) * 5 + 1;

    if (tmdbKey) {
      const pages = Array.from({ length: 5 }, (_, i) => startTmdbPage + i);
      const fetchPromises = pages.map(page =>
        fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}&language=he-IL&page=${page}`).then(r => r.json())
      );
      const results = await Promise.all(fetchPromises);
      const allMovies = results.flatMap(data => data.results || []);

      const movies = allMovies.filter((m: any) => m.poster_path).map((m: any) => ({
        id: m.id,
        title: m.title,
        genre: 'סרט',
        rating: m.vote_average,
        popularity: m.popularity,
        poster: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
        trailer: '',
        desc: m.overview || 'אין תיאור זמין בעברית.',
        mediaType: 'movie'
      }));
      return res.json({ movies, hasMore: batchNum < 10 });
    }

    // Fallback
    const fallback = [
      { id: 1, title: 'התחלה (Inception)', genre: 'מדע בדיוני', rating: 8.8, popularity: 95, poster: 'https://image.tmdb.org/t/p/w500/8Z8dpt8NqCvxu4XTEcXCFCISCE0.jpg', trailer: '', desc: 'גנב שגונב סודות תאגידיים.', mediaType: 'movie' },
      { id: 2, title: 'בין כוכבים (Interstellar)', genre: 'מדע בדיוני', rating: 8.6, popularity: 90, poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MvrIdlsR.jpg', trailer: '', desc: 'צוות חוקרים נוסע דרך חור תולעת.', mediaType: 'movie' },
    ];
    res.json({ movies: fallback, hasMore: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch TV Series (paginated)
app.get('/api/series', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.json({ series: [] });
    const batchNum = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const startTmdbPage = (batchNum - 1) * 5 + 1;
    const pages = Array.from({ length: 5 }, (_, i) => startTmdbPage + i);
    const fetchPromises = pages.map(page =>
      fetch(`https://api.themoviedb.org/3/discover/tv?sort_by=popularity.desc&api_key=${tmdbKey}&language=he-IL&page=${page}`).then(r => r.json())
    );
    const results = await Promise.all(fetchPromises);
    const allShows = results.flatMap(d => d.results || []);
    const series = allShows.filter((s: any) => s.poster_path).map((s: any) => ({
      id: s.id,
      title: s.name,
      genre: 'סדרה',
      rating: s.vote_average,
      popularity: s.popularity,
      poster: `https://image.tmdb.org/t/p/w500${s.poster_path}`,
      desc: s.overview || '',
      mediaType: 'tv'
    }));
    return res.json({ series, hasMore: batchNum < 10 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch Series Seasons
app.get('/api/series/:id', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.json({ seasons: [], seriesTitle: '' });
    const data = await fetch(`https://api.themoviedb.org/3/tv/${req.params.id}?api_key=${tmdbKey}&language=he-IL`).then(r => r.json());
    const seasons = (data.seasons || [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        id: s.id,
        title: `עונה ${s.season_number}`,
        season_number: s.season_number,
        seriesId: parseInt(req.params.id),
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : `https://image.tmdb.org/t/p/w500${data.poster_path}`,
        episode_count: s.episode_count,
        desc: `${s.episode_count} פרקים${s.overview ? ' — ' + s.overview : ''}`,
        genre: 'עונה',
        rating: data.vote_average,
        mediaType: 'season'
      }));
    return res.json({ seasons, seriesTitle: data.name });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Fetch Season Episodes
app.get('/api/series/:id/season/:num', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return res.json({ episodes: [], seasonTitle: '' });
    const data = await fetch(`https://api.themoviedb.org/3/tv/${req.params.id}/season/${req.params.num}?api_key=${tmdbKey}&language=he-IL`).then(r => r.json());
    const episodes = (data.episodes || []).map((e: any) => ({
      id: e.id,
      title: `${e.episode_number}. ${e.name}`,
      episode_number: e.episode_number,
      seriesId: parseInt(req.params.id),
      seasonNum: parseInt(req.params.num),
      poster: e.still_path ? `https://image.tmdb.org/t/p/w500${e.still_path}` : 'https://image.tmdb.org/t/p/w500/8Z8dpt8NqCvxu4XTEcXCFCISCE0.jpg',
      desc: e.overview || '',
      genre: 'פרק',
      rating: e.vote_average || 0,
      mediaType: 'episode'
    }));
    return res.json({ episodes, seasonTitle: data.name });
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
