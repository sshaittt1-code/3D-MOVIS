import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import cors from 'cors';
import path from 'node:path';
import { normalizeSearchText, rankSearchResults } from './src/utils/searchNormalize';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);

// Use crypto for simple ids
import crypto from 'crypto';

// Serve Latest Built APK for OTA Updates
app.use('/apk', express.static(path.join(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'debug')));

// Active Connected Clients
const activeClients = new Map<string, TelegramClient>();
const telegramAccessTokens = new Map<string, { sessionStr: string; peerId: string; messageId: number; expiresAt: number }>();
const tmdbSearchCache = new Map<string, { storedAt: number; results: any[] }>();
let searchCorpusCache: { storedAt: number; items: any[] } | null = null;

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

const FALLBACK_BATCH_SIZE = 100;
const FALLBACK_SOURCE_PAGES_PER_BATCH = 3;
const DEFAULT_PAGE_SIZE = 20;
const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 40;
const TELEGRAM_ACCESS_TOKEN_TTL_MS = 1000 * 60 * 60 * 8;
const SEARCH_CACHE_TTL_MS = 1000 * 60 * 10;
const TVMAZE_GENRE_MAP: Record<number, string[]> = {
  28: ['Action'],
  35: ['Comedy'],
  18: ['Drama'],
  27: ['Horror'],
  878: ['Science-Fiction'],
  10749: ['Romance'],
  53: ['Thriller'],
  16: ['Animation'],
  80: ['Crime'],
  12: ['Adventure'],
  10751: ['Children', 'Family'],
  14: ['Fantasy'],
  36: ['History']
};

const stripHtml = (value: string | null | undefined) =>
  (value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error';

const readStringValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const getTelegramApiConfig = () => {
  const apiId = readPositiveInt(process.env.TELEGRAM_API_ID || process.env.TG_API_ID);
  const apiHash = readStringValue(process.env.TELEGRAM_API_HASH || process.env.TG_API_HASH);
  if (!apiId || !apiHash) {
    throw new Error('Telegram API credentials are not configured on the server.');
  }
  return { apiId, apiHash };
};

const readPositiveInt = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const readOptionalInt = (value: unknown) => {
  if (value === undefined || value === null || value === '') return undefined;
  return readPositiveInt(value);
};

const readBoundedInt = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = readPositiveInt(value);
  if (!parsed) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const cleanupExpiredAccessTokens = (now = Date.now()) => {
  for (const [token, entry] of telegramAccessTokens.entries()) {
    if (entry.expiresAt <= now) {
      telegramAccessTokens.delete(token);
    }
  }
};

const issueTelegramAccessToken = (sessionStr: string, peerId: string, messageId: number) => {
  cleanupExpiredAccessTokens();
  const token = crypto.randomUUID().replace(/-/g, '');
  telegramAccessTokens.set(token, {
    sessionStr,
    peerId,
    messageId,
    expiresAt: Date.now() + TELEGRAM_ACCESS_TOKEN_TTL_MS
  });
  return token;
};

const resolveTelegramSession = (req: express.Request, peerId: string, messageId: number) => {
  const headerSession = readStringValue(req.headers['x-tg-session']);
  if (headerSession) return headerSession;

  const querySession = readStringValue(req.query.session);
  if (querySession) return querySession;

  const accessToken = readStringValue(req.query.token);
  if (!accessToken) throw new Error('Missing Telegram session');

  cleanupExpiredAccessTokens();
  const tokenEntry = telegramAccessTokens.get(accessToken);
  if (!tokenEntry) throw new Error('Telegram access token expired');
  if (tokenEntry.peerId !== peerId || tokenEntry.messageId !== messageId) {
    throw new Error('Telegram access token does not match the requested media');
  }

  return tokenEntry.sessionStr;
};

const extractTelegramDocumentInfo = (message: any) => {
  const document = message?.media?.document;
  const attributes = Array.isArray(document?.attributes) ? document.attributes : [];
  const fileNameAttr = attributes.find((attribute: any) => attribute?.className === 'DocumentAttributeFilename');
  const videoAttr = attributes.find((attribute: any) => attribute?.className === 'DocumentAttributeVideo');
  const audioAttr = attributes.find((attribute: any) => attribute?.className === 'DocumentAttributeAudio');
  const mimeType = document?.mimeType || 'video/mp4';
  const fileName = fileNameAttr?.fileName || message?.message || 'telegram-media.mp4';
  const fileSizeBytes = Number(document?.size || 0);
  const durationSeconds = Number(videoAttr?.duration || audioAttr?.duration || 0);
  const sourceKey = crypto
    .createHash('sha1')
    .update([message?.id, fileName, fileSizeBytes, mimeType].join('|'))
    .digest('hex')
    .slice(0, 24);

  return {
    document,
    mimeType,
    fileName,
    fileSizeBytes,
    durationSeconds,
    sourceKey
  };
};

const shuffleWithSeed = <T,>(items: T[], seed: number) => {
  const output = [...items];
  let state = seed || 1;

  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const swapIndex = state % (index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }

  return output;
};

const matchesTvMazeGenre = (genres: string[], genreId?: number) => {
  if (!genreId) return true;
  const allowedGenres = TVMAZE_GENRE_MAP[genreId];
  if (!allowedGenres || allowedGenres.length === 0) return true;
  return genres.some((genre) => allowedGenres.includes(genre));
};

const getSourcePagesPerBatch = (pageSize: number) =>
  Math.max(1, Math.min(5, Math.ceil(pageSize / 20) + 1));

const fetchTvMazeFallbackBatch = async (
  batchNum: number,
  genreId?: number,
  batchSize = FALLBACK_BATCH_SIZE,
  sourcePagesPerBatch = FALLBACK_SOURCE_PAGES_PER_BATCH
) => {
  const collected: any[] = [];
  const startPage = Math.max(0, (batchNum - 1) * sourcePagesPerBatch);

  for (let pageOffset = 0; pageOffset < sourcePagesPerBatch && collected.length < batchSize; pageOffset += 1) {
    const response = await fetch(`https://api.tvmaze.com/shows?page=${startPage + pageOffset}`);
    if (!response.ok) break;

    const shows = await response.json();
    if (!Array.isArray(shows) || shows.length === 0) break;

    const mappedShows = shows
      .filter((show: any) => show?.image?.original && matchesTvMazeGenre(show.genres || [], genreId))
      .map((show: any) => ({
        id: show.id,
        title: show.name,
        localizedTitle: show.name,
        originalTitle: show.name,
        genre: (show.genres || []).join(', ') || 'TV',
        rating: show.rating?.average || 0,
        popularity: show.weight || 0,
        poster: show.image?.original || show.image?.medium,
        trailer: '',
        desc: stripHtml(show.summary) || 'No description available.',
        mediaType: 'movie',
        year: show.premiered ? Number.parseInt(String(show.premiered).slice(0, 4), 10) : null,
        language: show.language || 'en'
      }));

    collected.push(...mappedShows);
  }

  return {
    movies: collected.slice(0, batchSize),
    hasMore: collected.length >= batchSize
  };
};

const mapTvMazeShow = (show: any) => ({
  id: show.id,
  title: show.name,
  localizedTitle: show.name,
  originalTitle: show.name,
  genre: (show.genres || []).join(', ') || 'TV',
  rating: show.rating?.average || 0,
  popularity: show.weight || 0,
  poster: show.image?.original || show.image?.medium,
  desc: stripHtml(show.summary) || 'No description available.',
  mediaType: 'tv',
  year: show.premiered ? Number.parseInt(String(show.premiered).slice(0, 4), 10) : null,
  language: show.language || 'en'
});

const fetchTvMazeSeriesBatch = async (batchNum: number, genreId?: number, batchSize = FALLBACK_BATCH_SIZE) => {
  const fallback = await fetchTvMazeFallbackBatch(batchNum, genreId, batchSize, getSourcePagesPerBatch(batchSize));
  return {
    series: fallback.movies.map((item) => ({ ...item, mediaType: 'tv' })),
    hasMore: fallback.hasMore
  };
};

const sortLocalCatalog = (items: any[], category: string, year?: number, israeliOnly = false, randomSeed = 1) => {
  let filtered = [...items];
  const resolveYear = (item: any) => item.year
    || (item.release_date ? Number.parseInt(String(item.release_date).slice(0, 4), 10) : null)
    || (item.first_air_date ? Number.parseInt(String(item.first_air_date).slice(0, 4), 10) : null)
    || (item.premiered ? Number.parseInt(String(item.premiered).slice(0, 4), 10) : null);
  const resolveRating = (item: any) => item.rating ?? item.vote_average ?? item.rating?.average ?? 0;
  const resolvePopularity = (item: any) => item.popularity ?? item.weight ?? 0;
  const resolveLanguage = (item: any) => String(item.language ?? item.original_language ?? '').toLowerCase();
  const isIsraeliLanguage = (item: any) => {
    const language = resolveLanguage(item);
    return language === 'he' || language === 'heb' || language.includes('hebrew') || language.includes('עבר');
  };

  if (year) {
    filtered = filtered.filter((item) => resolveYear(item) === year);
  }

  if (israeliOnly) {
    filtered = filtered.filter((item) => isIsraeliLanguage(item));
  }

  if (category === 'top_rated') {
    filtered.sort((left, right) => resolveRating(right) - resolveRating(left));
  } else if (category === 'random') {
    filtered = shuffleWithSeed(filtered, randomSeed);
  } else if (category === 'new_releases' || category === 'recently_active') {
    filtered.sort((left, right) => (resolveYear(right) || 0) - (resolveYear(left) || 0));
  } else {
    filtered.sort((left, right) => resolvePopularity(right) - resolvePopularity(left));
  }

  return filtered;
};

const fetchTvMazeShowContext = async (showId: number) => {
  const [showResponse, episodesResponse] = await Promise.all([
    fetch(`https://api.tvmaze.com/shows/${showId}`),
    fetch(`https://api.tvmaze.com/shows/${showId}/episodes`)
  ]);

  if (!showResponse.ok || !episodesResponse.ok) {
    throw new Error('Failed to load TVMaze show data');
  }

  const show = await showResponse.json();
  const episodes = await episodesResponse.json();
  return { show, episodes: Array.isArray(episodes) ? episodes : [] };
};

const getClientParam = async (sessionStr: string) => {
  if (!sessionStr) throw new Error("Missing Telegram Session! Please login on your TV.");
  if (activeClients.has(sessionStr)) return activeClients.get(sessionStr)!;
  const { apiId, apiHash } = getTelegramApiConfig();

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
    const phone = readStringValue(req.body?.phone);
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    const loginId = crypto.randomUUID();
    const { apiId, apiHash } = getTelegramApiConfig();

    const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 });
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
      { apiId, apiHash },
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
    const message = getErrorMessage(e);
    res.status(message.includes('not configured') ? 503 : 500).json({ error: message });
  }
});

// Submit Code
app.post('/api/tg/submitCode', async (req, res) => {
  const loginId = readStringValue(req.body?.loginId);
  const code = readStringValue(req.body?.code);
  if (!loginId || !code) return res.status(400).json({ error: 'Login id and code are required.' });
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
  const loginId = readStringValue(req.body?.loginId);
  const password = readStringValue(req.body?.password);
  if (!loginId || !password) return res.status(400).json({ error: 'Login id and password are required.' });
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
    res.json({ loggedIn: false, configured: !getErrorMessage(e).includes('not configured') });
  }
});

// Search for Movie
app.get('/api/tg/search', async (req, res) => {
  try {
    const query = readStringValue(req.query.query);
    if (!query) return res.status(400).json({ error: 'Missing query' });

    const sessionStr = readStringValue(req.headers['x-tg-session']);
    const client = await getClientParam(sessionStr);

    // Search globally across all dialogs for video files matching the query
    const result = await client.invoke(new Api.messages.SearchGlobal({
      q: query,
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
      const info = extractTelegramDocumentInfo(m);

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
        sizeBytes: info.fileSizeBytes,
        fileName: info.fileName,
        mimeType: info.mimeType,
        durationSeconds: info.durationSeconds,
      };
    });

    res.json({ results: formattedResults });
  } catch (e: any) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

// Stream Video with Range Support (Buffering)
app.get('/api/tg/source/:peerId/:messageId', async (req, res) => {
  try {
    const peerId = readStringValue(req.params.peerId);
    const messageId = readPositiveInt(req.params.messageId);
    if (!peerId || !messageId) return res.status(400).json({ error: 'Invalid source request' });
    const sessionStr = resolveTelegramSession(req, peerId, messageId);
    const client = await getClientParam(sessionStr);

    const messages = await client.getMessages(peerId, { ids: [messageId] });
    if (!messages || messages.length === 0) return res.status(404).json({ error: 'Message not found' });
    const message = messages[0];
    if (!message.media || !('document' in message.media)) return res.status(404).json({ error: 'No video media found' });

    const info = extractTelegramDocumentInfo(message);
    const accessToken = issueTelegramAccessToken(sessionStr, peerId, messageId);
    res.json({
      sourceKey: info.sourceKey,
      fileName: info.fileName,
      fileSizeBytes: info.fileSizeBytes,
      mimeType: info.mimeType,
      durationSeconds: info.durationSeconds,
      streamUrl: `/api/tg/stream/${peerId}/${messageId}?token=${accessToken}`,
      downloadUrl: `/api/tg/stream/${peerId}/${messageId}?token=${accessToken}`
    });
  } catch (e: any) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

app.get('/api/tg/stream/:peerId/:messageId', async (req, res) => {
  try {
    const peerId = readStringValue(req.params.peerId);
    const messageId = readPositiveInt(req.params.messageId);
    if (!peerId || !messageId) return res.status(400).send('Invalid stream request');
    const sessionStr = resolveTelegramSession(req, peerId, messageId);
    const client = await getClientParam(sessionStr);

    const messages = await client.getMessages(peerId, { ids: [messageId] });
    if (!messages || messages.length === 0) return res.status(404).send('Message not found');
    const message = messages[0];

    if (!message.media || !('document' in message.media)) return res.status(404).send('No video media found');

    const info = extractTelegramDocumentInfo(message);
    const fileSize = info.fileSizeBytes;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = Number.parseInt(parts[0], 10);
      const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
      if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end < start || end >= fileSize) {
        return res.status(416).send('Invalid range');
      }
      const chunksize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': info.mimeType,
        'Content-Disposition': `inline; filename=\"${info.fileName}\"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
        'X-Source-Key': info.sourceKey,
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
        'Content-Type': info.mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Disposition': `inline; filename=\"${info.fileName}\"`,
        'Cache-Control': 'private, max-age=0, must-revalidate',
        'X-Source-Key': info.sourceKey,
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
    if (!res.headersSent) res.status(500).send(getErrorMessage(e));
  }
});

// Search for Subtitles
app.get('/api/tg/search-subtitles', async (req, res) => {
  try {
    const query = readStringValue(req.query.query);
    if (!query) return res.status(400).json({ error: 'Missing query' });

    const sessionStr = readStringValue(req.headers['x-tg-session']);
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
      const accessToken = issueTelegramAccessToken(sessionStr, String(peerId), m.id);
      let title = 'Subtitle File';
      if (m.media && m.media.document) {
        const attr = m.media.document.attributes.find((a: any) => a.className === 'DocumentAttributeFilename');
        if (attr) title = attr.fileName;
      }
      return {
        id: m.id,
        peerId: peerId?.toString(),
        title,
        subtitleUrl: `/api/tg/subtitle/${peerId}/${m.id}?token=${accessToken}`
      };
    }).filter(r => r.title.toLowerCase().includes('.srt'));

    res.json({ results: formattedResults });
  } catch (e: any) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

// Stream and Convert Subtitle (SRT to VTT)
app.get('/api/tg/subtitle/:peerId/:messageId', async (req, res) => {
  try {
    const peerId = readStringValue(req.params.peerId);
    const messageId = readPositiveInt(req.params.messageId);
    if (!peerId || !messageId) return res.status(400).send('Invalid subtitle request');
    const sessionStr = resolveTelegramSession(req, peerId, messageId);
    const client = await getClientParam(sessionStr);

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
    res.status(500).send(getErrorMessage(e));
  }
});

// Fetch Movies with pagination (page=1 → TMDB pages 1-5, page=2 → 6-10, etc.)
app.get('/api/movies', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    const batchNum = readPositiveInt(req.query.page) ?? 1;
    const pageSize = readBoundedInt(req.query.page_size, MIN_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const sourcePagesPerBatch = getSourcePagesPerBatch(pageSize);
    const startTmdbPage = (batchNum - 1) * sourcePagesPerBatch + 1;
    const genreId = readOptionalInt(req.query.genre_id);
    const category = readStringValue(req.query.category) || 'popular';
    const year = readOptionalInt(req.query.year);
    const israeliOnly = req.query.israeli === '1';
    const randomSeed = readPositiveInt(req.query.seed) ?? Date.now();

    if (tmdbKey) {
      try {
      const pages = Array.from({ length: sourcePagesPerBatch }, (_, i) => startTmdbPage + i);
      const genreParam = genreId ? `&with_genres=${genreId}` : '';
      const yearParam = year ? `&primary_release_year=${year}` : '';
      const israeliParam = israeliOnly ? '&with_original_language=he' : '';
      const shouldUseDiscover = category === 'top_rated' || category === 'new_releases' || category === 'random' || !!genreParam || !!yearParam || !!israeliParam;
      const sortBy = category === 'top_rated'
        ? 'vote_average.desc&vote_count.gte=200'
        : category === 'new_releases'
          ? 'primary_release_date.desc'
          : 'popularity.desc';
      const endpoint = category === 'trending'
        ? `https://api.themoviedb.org/3/trending/movie/week?api_key=${tmdbKey}&language=he-IL&page=`
        : shouldUseDiscover
          ? `https://api.themoviedb.org/3/discover/movie?sort_by=${sortBy}&api_key=${tmdbKey}&language=he-IL${genreParam}${yearParam}${israeliParam}&page=`
          : `https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}&language=he-IL&page=`;
      const results = await Promise.all(pages.map(page => fetch(`${endpoint}${page}`).then(r => r.json())));
      const allMovies = sortLocalCatalog(results.flatMap(data => data.results || []), category, year, israeliOnly, randomSeed);

      const movies = allMovies.filter((m: any) => m.poster_path).map((m: any) => ({
        id: m.id,
        title: m.title || m.original_title,
        localizedTitle: m.title || m.original_title,
        originalTitle: m.original_title || m.title,
        genre: 'סרט',
        rating: m.vote_average,
        popularity: m.popularity,
        poster: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
        trailer: '',
        desc: m.overview || 'אין תיאור זמין בעברית.',
        mediaType: 'movie',
        year: m.release_date ? Number.parseInt(String(m.release_date).slice(0, 4), 10) : null,
        language: m.original_language || 'en'
      })).slice(0, pageSize);
        if (movies.length > 0) {
          return res.json({ movies, hasMore: movies.length >= pageSize });
        }
      } catch (tmdbError) {
        console.warn('TMDB movie fetch failed, falling back to TVMaze content.', tmdbError);
      }
    }

    // Fallback
    const fallback = await fetchTvMazeFallbackBatch(batchNum, genreId, pageSize, getSourcePagesPerBatch(pageSize));
    fallback.movies = sortLocalCatalog(fallback.movies, category, year, israeliOnly, randomSeed);
    /*
      { id: 1, title: 'התחלה (Inception)', genre: 'מדע בדיוני', rating: 8.8, popularity: 95, poster: 'https://image.tmdb.org/t/p/w500/8Z8dpt8NqCvxu4XTEcXCFCISCE0.jpg', trailer: '', desc: 'גנב שגונב סודות תאגידיים.', mediaType: 'movie' },
      { id: 2, title: 'בין כוכבים (Interstellar)', genre: 'מדע בדיוני', rating: 8.6, popularity: 90, poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MvrIdlsR.jpg', trailer: '', desc: 'צוות חוקרים נוסע דרך חור תולעת.', mediaType: 'movie' },
    ];
    */
    res.json(fallback);
  } catch (e: any) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

// Fetch TV Series (paginated)
app.get('/api/series', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    const batchNum = readPositiveInt(req.query.page) ?? 1;
    const pageSize = readBoundedInt(req.query.page_size, MIN_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const genreId = readOptionalInt(req.query.genre_id);
    const category = readStringValue(req.query.category) || 'popular';
    const year = readOptionalInt(req.query.year);
    const israeliOnly = req.query.israeli === '1';
    const randomSeed = readPositiveInt(req.query.seed) ?? Date.now();
    if (!tmdbKey) {
      const fallback = await fetchTvMazeSeriesBatch(batchNum, genreId, pageSize);
      return res.json({ ...fallback, series: sortLocalCatalog(fallback.series, category, year, israeliOnly, randomSeed) });
    }
    const sourcePagesPerBatch = getSourcePagesPerBatch(pageSize);
    const startTmdbPage = (batchNum - 1) * sourcePagesPerBatch + 1;
    const pages = Array.from({ length: sourcePagesPerBatch }, (_, i) => startTmdbPage + i);
    const genreParam = genreId ? `&with_genres=${genreId}` : '';
    const yearParam = year ? `&first_air_date_year=${year}` : '';
    const israeliParam = israeliOnly ? '&with_original_language=he' : '';
    const sortBy = category === 'top_rated'
      ? 'vote_average.desc&vote_count.gte=80'
      : category === 'recently_active'
        ? 'first_air_date.desc'
        : 'popularity.desc';
    const endpoint = category === 'trending'
      ? `https://api.themoviedb.org/3/trending/tv/week?api_key=${tmdbKey}&language=he-IL&page=`
      : `https://api.themoviedb.org/3/discover/tv?sort_by=${sortBy}&api_key=${tmdbKey}&language=he-IL${genreParam}${yearParam}${israeliParam}&page=`;
    const results = await Promise.all(pages.map(page =>
      fetch(`${endpoint}${page}`).then(r => r.json())
    ));
    const allShows = sortLocalCatalog(results.flatMap(d => d.results || []), category, year, israeliOnly, randomSeed);
    const series = allShows.filter((s: any) => s.poster_path).map((s: any) => ({
      id: s.id,
      title: s.name || s.original_name,
      localizedTitle: s.name || s.original_name,
      originalTitle: s.original_name || s.name,
      genre: 'סדרה',
      rating: s.vote_average,
      popularity: s.popularity,
      poster: `https://image.tmdb.org/t/p/w500${s.poster_path}`,
      desc: s.overview || '',
      mediaType: 'tv',
      year: s.first_air_date ? Number.parseInt(String(s.first_air_date).slice(0, 4), 10) : null,
      language: s.original_language || 'en'
    })).slice(0, pageSize);
    return res.json({ series, hasMore: series.length >= pageSize });
  } catch (e: any) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

app.get('/api/israeli', async (req, res) => {
  try {
    const batchNum = readPositiveInt(req.query.page) ?? 1;
    const pageSize = readBoundedInt(req.query.page_size, MIN_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const category = readStringValue(req.query.category) || 'popular';
    const year = readOptionalInt(req.query.year);
    const randomSeed = readPositiveInt(req.query.seed) ?? Date.now();
    const normalizedCategory = category === 'new_releases' ? 'recently_active' : category;
    const origin = `${req.protocol}://${req.get('host')}`;

    const [moviesData, seriesData] = await Promise.all([
      fetch(`${origin}/api/movies?page=${batchNum}&page_size=${pageSize}&category=${encodeURIComponent(category)}${year ? `&year=${year}` : ''}&israeli=1`)
        .then((response) => response.json())
        .catch(() => ({ movies: [], hasMore: false })),
      fetch(`${origin}/api/series?page=${batchNum}&page_size=${pageSize}&category=${encodeURIComponent(normalizedCategory)}${year ? `&year=${year}` : ''}&israeli=1`)
        .then((response) => response.json())
        .catch(() => ({ series: [], hasMore: false }))
    ]);

    const items = sortLocalCatalog([
      ...(Array.isArray(moviesData.movies) ? moviesData.movies : []),
      ...(Array.isArray(seriesData.series) ? seriesData.series : [])
    ], normalizedCategory, year, true, randomSeed).slice(0, pageSize);

    res.json({
      items,
      hasMore: Boolean(moviesData.hasMore) || Boolean(seriesData.hasMore)
    });
  } catch (e: any) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

// Fetch Series Seasons
app.get('/api/series/:id', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    const seriesId = readPositiveInt(req.params.id);
    if (!seriesId) return res.status(400).json({ error: 'Invalid series id' });
    if (!tmdbKey) {
      const { show, episodes } = await fetchTvMazeShowContext(seriesId);
      const seasons = Array.from(new Set(episodes.map((episode: any) => episode.season)))
        .sort((left, right) => left - right)
        .map((seasonNumber, index) => {
          const seasonEpisodes = episodes.filter((episode: any) => episode.season === seasonNumber);
          return {
            id: Number(`${show.id}${seasonNumber}`),
            title: `Season ${seasonNumber}`,
            season_number: seasonNumber,
            seriesId: show.id,
            poster: show.image?.original || show.image?.medium,
            episode_count: seasonEpisodes.length,
            desc: stripHtml(show.summary) || `${seasonEpisodes.length} episodes`,
            genre: 'Season',
            rating: show.rating?.average || 0,
            mediaType: 'season'
          };
        });
      return res.json({ seasons, seriesTitle: show.name });
    }
    const data = await fetch(`https://api.themoviedb.org/3/tv/${seriesId}?api_key=${tmdbKey}&language=he-IL`).then(r => r.json());
    const seasons = (data.seasons || [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        id: s.id,
        title: `עונה ${s.season_number}`,
        season_number: s.season_number,
        seriesId,
        poster: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : `https://image.tmdb.org/t/p/w500${data.poster_path}`,
        episode_count: s.episode_count,
        desc: `${s.episode_count} פרקים${s.overview ? ' — ' + s.overview : ''}`,
        genre: 'עונה',
        rating: data.vote_average,
        mediaType: 'season'
      }));
    return res.json({ seasons, seriesTitle: data.name });
  } catch (e: any) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

// Fetch Season Episodes
app.get('/api/series/:id/season/:num', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    const showId = readPositiveInt(req.params.id);
    const seasonNum = readPositiveInt(req.params.num);
    if (!showId || !seasonNum) return res.status(400).json({ error: 'Invalid season request' });
    if (!tmdbKey) {
      const { show, episodes: allEpisodes } = await fetchTvMazeShowContext(showId);
      const episodes = allEpisodes
        .filter((episode: any) => episode.season === seasonNum)
        .map((episode: any) => ({
          id: episode.id,
          title: `${episode.number}. ${episode.name}`,
          episode_number: episode.number,
          seriesId: showId,
          seasonNum,
          poster: episode.image?.original || episode.image?.medium || show.image?.original || show.image?.medium,
          desc: stripHtml(episode.summary) || '',
          genre: 'Episode',
          rating: episode.rating?.average || 0,
          mediaType: 'episode',
          year: episode.airdate ? Number.parseInt(String(episode.airdate).slice(0, 4), 10) : null
        }));
      return res.json({ episodes, seasonTitle: `Season ${seasonNum}` });
    }
    const data = await fetch(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNum}?api_key=${tmdbKey}&language=he-IL`).then(r => r.json());
    const episodes = (data.episodes || []).map((e: any) => ({
      id: e.id,
      title: `${e.episode_number}. ${e.name}`,
      episode_number: e.episode_number,
      seriesId: showId,
      seasonNum,
      poster: e.still_path ? `https://image.tmdb.org/t/p/w500${e.still_path}` : 'https://image.tmdb.org/t/p/w500/8Z8dpt8NqCvxu4XTEcXCFCISCE0.jpg',
      desc: e.overview || '',
      genre: 'פרק',
      rating: e.vote_average || 0,
      mediaType: 'episode'
    }));
    return res.json({ episodes, seasonTitle: data.name });
  } catch (e: any) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

async function startServer() {
  // OTA Version Check
  app.get('/api/version', (req, res) => {
    res.json({
      version: '1.0.6',
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

const dedupeSearchItems = (items: any[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item?.mediaType || 'unknown'}:${item?.id ?? item?.title ?? 'unknown'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const mapTmdbMovieSearchResult = (movie: any, alternateTitles: string[] = []) => ({
  id: movie.id,
  title: movie.title || movie.original_title,
  localizedTitle: movie.title || movie.original_title,
  originalTitle: movie.original_title || movie.title,
  hebrewTitle: movie.title || movie.original_title,
  alternateTitles,
  genre: 'סרט',
  rating: movie.vote_average,
  poster: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
  desc: movie.overview || '',
  mediaType: 'movie',
  popularity: movie.popularity,
  year: movie.release_date ? Number.parseInt(String(movie.release_date).slice(0, 4), 10) : null
});

const mapTmdbSeriesSearchResult = (series: any, alternateTitles: string[] = []) => ({
  id: series.id,
  title: series.name || series.original_name,
  localizedTitle: series.name || series.original_name,
  originalTitle: series.original_name || series.name,
  hebrewTitle: series.name || series.original_name,
  alternateTitles,
  genre: 'סדרה',
  rating: series.vote_average,
  poster: `https://image.tmdb.org/t/p/w500${series.poster_path}`,
  desc: series.overview || '',
  mediaType: 'tv',
  popularity: series.popularity,
  year: series.first_air_date ? Number.parseInt(String(series.first_air_date).slice(0, 4), 10) : null
});

const getCachedSearchEntry = (cacheKey: string) => {
  const cached = tmdbSearchCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.storedAt > SEARCH_CACHE_TTL_MS) {
    tmdbSearchCache.delete(cacheKey);
    return null;
  }
  return cached.results;
};

const setCachedSearchEntry = (cacheKey: string, results: any[]) => {
  tmdbSearchCache.set(cacheKey, { storedAt: Date.now(), results });
};

const enrichTmdbAliases = async (tmdbKey: string, mediaType: 'movie' | 'tv', id: number) => {
  const cacheKey = `aliases:${mediaType}:${id}`;
  const cached = getCachedSearchEntry(cacheKey);
  if (cached) return cached;

  const endpoint = mediaType === 'movie'
    ? `https://api.themoviedb.org/3/movie/${id}/alternative_titles?api_key=${tmdbKey}`
    : `https://api.themoviedb.org/3/tv/${id}/alternative_titles?api_key=${tmdbKey}`;

  try {
    const data = await fetch(endpoint).then((response) => response.json());
    const titles = Array.isArray(data?.titles)
      ? data.titles.map((item: any) => item?.title).filter(Boolean)
      : Array.isArray(data?.results)
        ? data.results.map((item: any) => item?.title || item?.name).filter(Boolean)
        : [];
    const deduped = Array.from(new Set(titles.map((title: string) => String(title).trim()).filter(Boolean)));
    setCachedSearchEntry(cacheKey, deduped);
    return deduped;
  } catch {
    return [];
  }
};

const getSearchCorpus = async (tmdbKey: string) => {
  if (searchCorpusCache && Date.now() - searchCorpusCache.storedAt <= SEARCH_CACHE_TTL_MS) {
    return searchCorpusCache.items;
  }

  const endpoints = [
    `https://api.themoviedb.org/3/movie/popular?api_key=${tmdbKey}&language=he-IL&page=1`,
    `https://api.themoviedb.org/3/trending/movie/week?api_key=${tmdbKey}&language=he-IL&page=1`,
    `https://api.themoviedb.org/3/tv/popular?api_key=${tmdbKey}&language=he-IL&page=1`,
    `https://api.themoviedb.org/3/trending/tv/week?api_key=${tmdbKey}&language=he-IL&page=1`,
    `https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}&language=he-IL&with_original_language=he&sort_by=popularity.desc&page=1`,
    `https://api.themoviedb.org/3/discover/tv?api_key=${tmdbKey}&language=he-IL&with_original_language=he&sort_by=popularity.desc&page=1`
  ];

  const payloads = await Promise.all(endpoints.map((endpoint) => fetch(endpoint).then((response) => response.json()).catch(() => ({ results: [] }))));
  const items = dedupeSearchItems([
    ...((payloads[0].results || []) as any[]).filter((item: any) => item.poster_path).map((item: any) => mapTmdbMovieSearchResult(item)),
    ...((payloads[1].results || []) as any[]).filter((item: any) => item.poster_path).map((item: any) => mapTmdbMovieSearchResult(item)),
    ...((payloads[2].results || []) as any[]).filter((item: any) => item.poster_path).map((item: any) => mapTmdbSeriesSearchResult(item)),
    ...((payloads[3].results || []) as any[]).filter((item: any) => item.poster_path).map((item: any) => mapTmdbSeriesSearchResult(item)),
    ...((payloads[4].results || []) as any[]).filter((item: any) => item.poster_path).map((item: any) => mapTmdbMovieSearchResult(item)),
    ...((payloads[5].results || []) as any[]).filter((item: any) => item.poster_path).map((item: any) => mapTmdbSeriesSearchResult(item))
  ]);

  searchCorpusCache = { storedAt: Date.now(), items };
  return items;
};

// TMDB Multi-Search
app.get('/api/search', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    const query = readStringValue(req.query.q);
    if (!query) return res.json({ results: [] });
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return res.json({ results: [] });

    const type = readStringValue(req.query.type) || 'all';
    const cacheKey = `search:${type}:${normalizedQuery}`;
    const cached = getCachedSearchEntry(cacheKey);
    if (cached) {
      return res.json({ results: cached });
    }

    if (!tmdbKey) {
      const tvMazeResults = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`).then((response) => response.json());
      const results = rankSearchResults((Array.isArray(tvMazeResults) ? tvMazeResults : [])
        .map((entry: any) => entry.show)
        .filter((show: any) => show?.image?.original)
        .map((show: any) => ({
          ...mapTvMazeShow(show),
          alternateTitles: Array.isArray(show.akas) ? show.akas : []
        })), query).slice(0, 40);
      setCachedSearchEntry(cacheKey, results);
      return res.json({ results });
    }

    const [movieHe, movieEn, tvHe, tvEn, corpus] = await Promise.all([
      type !== 'tv'
        ? fetch(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&language=he-IL&query=${encodeURIComponent(query)}&page=1`).then((response) => response.json()).catch(() => ({ results: [] }))
        : Promise.resolve({ results: [] }),
      type !== 'tv'
        ? fetch(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&language=en-US&query=${encodeURIComponent(query)}&page=1`).then((response) => response.json()).catch(() => ({ results: [] }))
        : Promise.resolve({ results: [] }),
      type !== 'movie'
        ? fetch(`https://api.themoviedb.org/3/search/tv?api_key=${tmdbKey}&language=he-IL&query=${encodeURIComponent(query)}&page=1`).then((response) => response.json()).catch(() => ({ results: [] }))
        : Promise.resolve({ results: [] }),
      type !== 'movie'
        ? fetch(`https://api.themoviedb.org/3/search/tv?api_key=${tmdbKey}&language=en-US&query=${encodeURIComponent(query)}&page=1`).then((response) => response.json()).catch(() => ({ results: [] }))
        : Promise.resolve({ results: [] }),
      getSearchCorpus(tmdbKey)
    ]);

    const rawMovies = dedupeSearchItems([
      ...((movieHe.results || []) as any[]),
      ...((movieEn.results || []) as any[])
    ]).filter((item: any) => item.poster_path);

    const rawSeries = dedupeSearchItems([
      ...((tvHe.results || []) as any[]),
      ...((tvEn.results || []) as any[])
    ]).filter((item: any) => item.poster_path);

    const [movies, series] = await Promise.all([
      Promise.all(rawMovies.slice(0, 10).map(async (item: any) => mapTmdbMovieSearchResult(item, await enrichTmdbAliases(tmdbKey, 'movie', item.id)))),
      Promise.all(rawSeries.slice(0, 10).map(async (item: any) => mapTmdbSeriesSearchResult(item, await enrichTmdbAliases(tmdbKey, 'tv', item.id))))
    ]);

    const ranked = rankSearchResults(dedupeSearchItems([
      ...movies,
      ...series,
      ...corpus
    ]), query).slice(0, 40);

    setCachedSearchEntry(cacheKey, ranked);
    res.json({ results: ranked });
  } catch (e: any) {
    res.status(500).json({ error: getErrorMessage(e) });
  }
});

// TMDB Genre list (Hebrew)
app.get('/api/genres', (_req, res) => {
  res.json({ genres: [
    { id: 0,    name: 'הכל',           tmdbId: null },
    { id: 28,   name: 'פעולה',          tmdbId: 28 },
    { id: 35,   name: 'קומדיה',          tmdbId: 35 },
    { id: 18,   name: 'דרמה',           tmdbId: 18 },
    { id: 27,   name: 'אימה',           tmdbId: 27 },
    { id: 878,  name: 'מדע בדיוני',   tmdbId: 878 },
    { id: 10749,name: 'רומנטיקה',        tmdbId: 10749 },
    { id: 53,   name: 'מותחן',          tmdbId: 53 },
    { id: 16,   name: 'אנימציה',        tmdbId: 16 },
    { id: 80,   name: 'פשע ומסתורין', tmdbId: 80 },
    { id: 12,   name: 'הרפתקאות',       tmdbId: 12 },
    { id: 10751,name: 'משפחתי',        tmdbId: 10751 },
    { id: 14,   name: 'פנטזיה',         tmdbId: 14 },
    { id: 36,   name: 'היסטוריה',        tmdbId: 36 },
  ]});
});
