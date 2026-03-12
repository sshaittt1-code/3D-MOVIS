import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import cors from 'cors';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    tgConfigured: isTmdConfigured(),
    env: {
      TG_API_ID: process.env.TG_API_ID ? 'set' : 'missing',
      TG_API_HASH: process.env.TG_API_HASH ? 'set' : 'missing',
    }
  });
});

const PORT = 3000;
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TMD_IMAGE = process.env.TMD_IMAGE || 'ghcr.io/xumeiquer/tmd';
const TMD_RUNTIME_ROOT = process.env.TMD_RUNTIME_ROOT || path.resolve('.tmd-runtime');
const TMD_DATA_ROOT = path.join(TMD_RUNTIME_ROOT, 'data');
const TMD_DOWNLOADS_ROOT = path.join(TMD_RUNTIME_ROOT, 'downloads');

// In-memory storage for the session (in a real app, save to DB)
let sessionString = '';
let tgClient: TelegramClient | null = null;

// Auth state resolvers
let resolveCode: ((code: string) => void) | null = null;
let resolvePassword: ((pw: string) => void) | null = null;
let rejectLogin: ((err: any) => void) | null = null;

type TmdJobStatus = 'queued' | 'running' | 'completed' | 'failed';

type TmdJob = {
  id: string;
  status: TmdJobStatus;
  createdAt: number;
  updatedAt: number;
  title: string;
  messageUrl: string;
  outputDir: string;
  filePath: string | null;
  streamPath: string | null;
  error: string | null;
};

const tmdJobs = new Map<string, TmdJob>();

const buildTmdbApiUrl = (path: string, params: Record<string, string | number>) => {
  const url = new URL(`${TMDB_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
};

const buildPosterProxyPath = (posterPath: string | null | undefined, size = 'w780') => {
  if (!posterPath) return '';
  return `/api/poster?path=${encodeURIComponent(posterPath)}&size=${encodeURIComponent(size)}`;
};

const buildRemoteImageProxyPath = (url: string | null | undefined) => {
  if (!url) return '';
  return `/api/remote-image?url=${encodeURIComponent(url)}`;
};

const normalizePosterUrl = (poster: string | null | undefined) => {
  if (!poster) return '';
  if (poster.includes('/api/poster') || poster.includes('/api/remote-image')) return poster;
  if (poster.startsWith('http://') || poster.startsWith('https://')) return buildRemoteImageProxyPath(poster);
  if (poster.startsWith('/')) return buildPosterProxyPath(poster);
  return poster;
};

const slugifyTitle = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'telegram-item';

const isTmdConfigured = () => {
  return Boolean(process.env.TG_API_ID && process.env.TG_API_HASH);
};

const isTmdPublicMessageUrl = (messageUrl: string) => /^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+/.test(messageUrl);

const createTmdJob = (title: string, messageUrl: string) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outputDir = path.join(TMD_DOWNLOADS_ROOT, `${slugifyTitle(title)}-${id}`);
  const job: TmdJob = {
    id,
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title,
    messageUrl,
    outputDir,
    filePath: null,
    streamPath: null,
    error: null,
  };
  tmdJobs.set(id, job);
  return job;
};

const withTmdStatus = () => {
  if (!isTmdConfigured()) {
    return {
      enabled: false,
      reason: 'Missing TG_API_ID or TG_API_HASH for TMD runtime.',
    };
  }

  return {
    enabled: true,
    image: TMD_IMAGE,
    runtimeRoot: TMD_RUNTIME_ROOT,
  };
};

const ensureTmdDirectories = async () => {
  await fs.mkdir(TMD_DATA_ROOT, { recursive: true });
  await fs.mkdir(TMD_DOWNLOADS_ROOT, { recursive: true });
};

const runTmdDownloadJob = async (job: TmdJob) => {
  await ensureTmdDirectories();

  job.status = 'running';
  job.updatedAt = Date.now();

  const dockerArgs = [
    'run',
    '--rm',
    '-e', `TMD_TDLIB_API_ID=${process.env.TG_API_ID || ''}`,
    '-e', `TMD_TDLIB_API_HASH=${process.env.TG_API_HASH || ''}`,
    '-e', 'TMD_TDLIB_PATH=/data/tdlib',
    '-e', 'TMD_TDLIB_FILES_PATH=/data/files',
    '-e', 'TMD_TDLIB_DATABASE_PATH=/data/database',
    '-v', `${TMD_DATA_ROOT}:/data`,
    '-v', `${TMD_DOWNLOADS_ROOT}:/downloads`,
    TMD_IMAGE,
    'download',
    'message',
    '--store',
    `/downloads/${path.basename(job.outputDir)}`,
    '--message-url',
    job.messageUrl,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', dockerArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `tmd exited with code ${code}`));
    });
  });

  const files = await fs.readdir(job.outputDir).catch(() => []);
  const candidates = await Promise.all(
    files.map(async (fileName) => {
      const filePath = path.join(job.outputDir, fileName);
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats?.isFile()) return null;
      return { filePath, size: stats.size };
    }),
  );

  const selected = candidates
    .filter((item): item is { filePath: string; size: number } => Boolean(item))
    .sort((left, right) => right.size - left.size)[0];

  if (!selected) {
    throw new Error('tmd completed but no downloaded file was found');
  }

  job.filePath = selected.filePath;
  job.streamPath = `/api/tg/tmd/stream/${job.id}`;
  job.status = 'completed';
  job.updatedAt = Date.now();
};

const fetchOmdbTitleInfo = async (title: string, year?: string, type?: string) => {
  const omdbKey = process.env.OMDB_API_KEY;
  if (!omdbKey || !title) return null;

  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', omdbKey);
  url.searchParams.set('t', title);
  if (year) url.searchParams.set('y', year);
  if (type && (type === 'movie' || type === 'series')) url.searchParams.set('type', type);

  const response = await fetch(url.toString());
  const data = await response.json();
  if (!response.ok || data?.Response === 'False') {
    return null;
  }

  return {
    imdbId: data.imdbID || '',
    imdbRating: data.imdbRating || '',
    imdbVotes: data.imdbVotes || '',
    poster: data.Poster && data.Poster !== 'N/A' ? data.Poster : '',
    year: data.Year || '',
    runtime: data.Runtime || '',
    rated: data.Rated || '',
    plot: data.Plot && data.Plot !== 'N/A' ? data.Plot : '',
    genres: data.Genre || '',
    totalSeasons: data.totalSeasons || '',
  };
};

const FALLBACK_SERIES = [
  {
    id: 1001,
    title: 'Stranger Things',
    genre: 'Series',
    rating: '8.7',
    popularity: 94,
    poster: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
    desc: 'A group of kids uncovers mysteries, experiments, and creatures from another dimension.',
    seasons: [
      {
        id: 1101,
        title: 'Season 1',
        seasonNumber: 1,
        rating: '8.6',
        popularity: 90,
        poster: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
        desc: 'The disappearance of Will Byers opens a supernatural mystery.',
        episodes: [
          { id: 11101, title: 'Chapter One: The Vanishing of Will Byers', episodeNumber: 1, rating: '8.5', popularity: 88, poster: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg', desc: 'Will disappears and Eleven appears.' },
          { id: 11102, title: 'Chapter Two: The Weirdo on Maple Street', episodeNumber: 2, rating: '8.3', popularity: 86, poster: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg', desc: 'The boys hide Eleven and the search intensifies.' },
        ],
      },
      {
        id: 1102,
        title: 'Season 2',
        seasonNumber: 2,
        rating: '8.4',
        popularity: 87,
        poster: 'https://image.tmdb.org/t/p/w500/x2LSRK2Cm7MZhjluni1msVJ3wDF.jpg',
        desc: 'The gate is still open and Hawkins is not safe yet.',
        episodes: [
          { id: 11201, title: 'MADMAX', episodeNumber: 1, rating: '8.2', popularity: 84, poster: 'https://image.tmdb.org/t/p/w500/x2LSRK2Cm7MZhjluni1msVJ3wDF.jpg', desc: 'A new school year begins with a new mystery.' },
          { id: 11202, title: 'Trick or Treat, Freak', episodeNumber: 2, rating: '8.0', popularity: 82, poster: 'https://image.tmdb.org/t/p/w500/x2LSRK2Cm7MZhjluni1msVJ3wDF.jpg', desc: 'The gang senses something is wrong again.' },
        ],
      },
    ],
  },
  {
    id: 1002,
    title: 'Breaking Bad',
    genre: 'Series',
    rating: '9.5',
    popularity: 97,
    poster: 'https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg',
    desc: 'A chemistry teacher turns to meth production and transforms his life.',
    seasons: [
      {
        id: 1201,
        title: 'Season 1',
        seasonNumber: 1,
        rating: '9.0',
        popularity: 93,
        poster: 'https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg',
        desc: 'Walter White takes his first steps into a criminal empire.',
        episodes: [
          { id: 12101, title: 'Pilot', episodeNumber: 1, rating: '8.9', popularity: 90, poster: 'https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg', desc: 'Walter White makes a desperate decision.' },
          { id: 12102, title: 'Cat\'s in the Bag...', episodeNumber: 2, rating: '8.7', popularity: 88, poster: 'https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg', desc: 'Walter and Jesse try to clean up the mess.' },
        ],
      },
    ],
  },
];

const withPosterProxyObject = (item: any) => ({
  ...item,
  poster: normalizePosterUrl(item.poster),
  backdrop: normalizePosterUrl(item.backdrop),
});

const fetchOmdbCatalog = async () => {
  const omdbKey = process.env.OMDB_API_KEY;
  if (!omdbKey) return [];

  const searchTerms = ['star', 'love', 'night', 'war', 'man', 'world', 'dark', 'last', 'girl', 'king'];
  const pages = [1, 2, 3, 4, 5];
  const responses = await Promise.all(
    searchTerms.flatMap((term) =>
      pages.map((page) =>
        fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(omdbKey)}&s=${encodeURIComponent(term)}&type=movie&page=${page}`),
      ),
    ),
  );
  const payloads = await Promise.all(responses.map((response) => response.json()));
  const uniqueMovies = new Map<string, any>();

  for (const payload of payloads) {
    for (const movie of payload.Search || []) {
      if (!movie?.imdbID || !movie?.Poster || movie.Poster === 'N/A' || uniqueMovies.has(movie.imdbID)) {
        continue;
      }

      uniqueMovies.set(movie.imdbID, {
        id: movie.imdbID,
        title: movie.Title || 'Untitled',
        genre: 'Movie',
        rating: '0.0',
        popularity: 60,
        poster: normalizePosterUrl(movie.Poster),
        backdrop: normalizePosterUrl(movie.Poster),
        trailer: '',
        desc: '',
        year: movie.Year || '',
        mediaType: 'movie',
      });
    }
  }

  return Array.from(uniqueMovies.values());
};

const fetchTvMazeCatalog = async () => {
  const pages = [0, 1, 2, 3, 4];
  const responses = await Promise.all(pages.map((page) => fetch(`https://api.tvmaze.com/shows?page=${page}`)));
  const payloads = await Promise.all(responses.map((response) => response.json()));
  const shows = payloads
    .flat()
    .filter((show: any) => show?.id && (show.image?.original || show.image?.medium))
    .map((show: any) => ({
      id: show.id,
      title: show.name || 'Untitled Series',
      genre: show.genres?.[0] || 'Series',
      rating: Number(show.rating?.average || 0).toFixed(1),
      popularity: Math.round(show.weight || show.rating?.average * 10 || 0),
      poster: normalizePosterUrl(show.image?.original || show.image?.medium),
      backdrop: normalizePosterUrl(show.image?.original || show.image?.medium),
      desc: show.summary ? String(show.summary).replace(/<[^>]+>/g, '').trim() : '',
      year: show.premiered ? String(show.premiered).slice(0, 4) : '',
      mediaType: 'series',
    }));

  shows.sort((left: any, right: any) => {
    const ratingDiff = Number(right.rating || 0) - Number(left.rating || 0);
    if (ratingDiff !== 0) return ratingDiff;
    return Number(right.popularity || 0) - Number(left.popularity || 0);
  });

  return shows;
};

const fetchTvMazeSeasons = async (seriesId: string) => {
  const response = await fetch(`https://api.tvmaze.com/shows/${seriesId}/seasons`);
  const seasons = await response.json();
  return (seasons || [])
    .filter((season: any) => Number(season.number) > 0)
    .map((season: any) => ({
      id: season.id,
      seriesId: Number(seriesId),
      title: season.name || `Season ${season.number}`,
      seasonNumber: season.number,
      rating: '0.0',
      popularity: Math.round(season.episodeOrder || 0),
      poster: normalizePosterUrl(season.image?.original || season.image?.medium),
      desc: season.summary ? String(season.summary).replace(/<[^>]+>/g, '').trim() : '',
      mediaType: 'season',
    }));
};

const fetchTvMazeEpisodes = async (seriesId: string, seasonNumber: string) => {
  const response = await fetch(`https://api.tvmaze.com/shows/${seriesId}/episodes`);
  const episodes = await response.json();
  return (episodes || [])
    .filter((episode: any) => String(episode.season) === seasonNumber)
    .map((episode: any) => ({
      id: episode.id,
      title: episode.name || `Episode ${episode.number}`,
      episodeNumber: episode.number,
      rating: Number(episode.rating?.average || 0).toFixed(1),
      popularity: Math.round(episode.rating?.average ? episode.rating.average * 10 : 0),
      poster: normalizePosterUrl(episode.image?.original || episode.image?.medium),
      desc: episode.summary ? String(episode.summary).replace(/<[^>]+>/g, '').trim() : '',
      mediaType: 'episode',
    }));
};

const fetchTmdbCatalog = async (tmdbKey: string) => {
  const language = 'he-IL';
  const fallbackLanguage = 'en-US';
  const catalogRequests = [
    ['/movie/popular', 1],
    ['/movie/popular', 2],
    ['/movie/popular', 3],
    ['/movie/top_rated', 1],
    ['/movie/top_rated', 2],
    ['/movie/now_playing', 1],
    ['/movie/now_playing', 2],
    ['/movie/upcoming', 1],
    ['/movie/upcoming', 2],
    ['/discover/movie', 1],
    ['/discover/movie', 2],
    ['/discover/movie', 3],
  ] as const;

  const [genreResponse, ...catalogResponses] = await Promise.all([
    fetch(buildTmdbApiUrl('/genre/movie/list', { api_key: tmdbKey, language })),
    ...catalogRequests.map(([path, page]) =>
      fetch(
        buildTmdbApiUrl(path, {
          api_key: tmdbKey,
          language,
          page,
          include_adult: 'false',
          sort_by: path === '/discover/movie' ? 'popularity.desc' : 'popularity.desc',
          'vote_count.gte': path === '/discover/movie' ? 200 : 0,
        }),
      ),
    ),
  ]);

  const genrePayload = await genreResponse.json();
  const genreMap = new Map<number, string>((genrePayload.genres || []).map((genre: any) => [genre.id, genre.name]));

  const payloads = await Promise.all(catalogResponses.map((response) => response.json()));
  const uniqueMovies = new Map<number, any>();

  for (const payload of payloads) {
    for (const movie of payload.results || []) {
      if (!movie?.id || !movie.poster_path || uniqueMovies.has(movie.id)) {
        continue;
      }

      uniqueMovies.set(movie.id, {
        id: movie.id,
        title: movie.title || movie.original_title || 'Untitled',
        genre: genreMap.get(movie.genre_ids?.[0]) || 'סרט',
        rating: Number(movie.vote_average || 0).toFixed(1),
        popularity: Math.round(movie.popularity || 0),
        poster: buildPosterProxyPath(movie.poster_path),
        backdrop: movie.backdrop_path ? buildPosterProxyPath(movie.backdrop_path, 'w1280') : '',
        trailer: '',
        desc: movie.overview || 'אין תיאור זמין כרגע.',
        year: movie.release_date ? String(movie.release_date).slice(0, 4) : '',
      });
    }
  }

  const movies = Array.from(uniqueMovies.values());
  if (movies.length > 0) {
    return movies;
  }

  const fallbackResponse = await fetch(buildTmdbApiUrl('/movie/popular', { api_key: tmdbKey, language: fallbackLanguage, page: 1 }));
  const fallbackPayload = await fallbackResponse.json();
  return (fallbackPayload.results || [])
    .filter((movie: any) => movie?.poster_path)
    .map((movie: any) => ({
      id: movie.id,
      title: movie.title || movie.original_title || 'Untitled',
      genre: 'Movie',
      rating: Number(movie.vote_average || 0).toFixed(1),
      popularity: Math.round(movie.popularity || 0),
      poster: buildPosterProxyPath(movie.poster_path),
      backdrop: movie.backdrop_path ? buildPosterProxyPath(movie.backdrop_path, 'w1280') : '',
      trailer: '',
      desc: movie.overview || 'No description available.',
      year: movie.release_date ? String(movie.release_date).slice(0, 4) : '',
    }));
};

const fetchTmdbSeriesCatalog = async (tmdbKey: string) => {
  const language = 'en-US';
  const pages = [1, 2, 3, 4];
  const responses = await Promise.all(
    pages.flatMap((page) => [
      fetch(buildTmdbApiUrl('/tv/popular', { api_key: tmdbKey, language, page })),
      fetch(buildTmdbApiUrl('/tv/top_rated', { api_key: tmdbKey, language, page })),
      fetch(buildTmdbApiUrl('/tv/on_the_air', { api_key: tmdbKey, language, page })),
    ]),
  );
  const payloads = await Promise.all(responses.map((response) => response.json()));
  const uniqueSeries = new Map<number, any>();

  for (const payload of payloads) {
    for (const show of payload.results || []) {
      if (!show?.id || !show.poster_path || uniqueSeries.has(show.id)) continue;
      uniqueSeries.set(show.id, {
        id: show.id,
        title: show.name || show.original_name || 'Untitled Series',
        genre: 'Series',
        rating: Number(show.vote_average || 0).toFixed(1),
        popularity: Math.round(show.popularity || 0),
        poster: buildPosterProxyPath(show.poster_path),
        desc: show.overview || 'No description available.',
        mediaType: 'series',
      });
    }
  }

  return Array.from(uniqueSeries.values());
};

const fetchTmdbSeasons = async (tmdbKey: string, seriesId: string) => {
  const response = await fetch(buildTmdbApiUrl(`/tv/${seriesId}`, { api_key: tmdbKey, language: 'en-US' }));
  const show = await response.json();
  return (show.seasons || [])
    .filter((season: any) => season.season_number > 0)
    .map((season: any) => ({
      id: season.id,
      seriesId: Number(seriesId),
      title: season.name || `Season ${season.season_number}`,
      seasonNumber: season.season_number,
      rating: show.vote_average ? Number(show.vote_average).toFixed(1) : '0.0',
      popularity: Math.round(show.popularity || 0),
      poster: buildPosterProxyPath(season.poster_path || show.poster_path),
      desc: season.overview || show.overview || 'No description available.',
      mediaType: 'season',
    }));
};

const fetchTmdbEpisodes = async (tmdbKey: string, seriesId: string, seasonNumber: string) => {
  const response = await fetch(buildTmdbApiUrl(`/tv/${seriesId}/season/${seasonNumber}`, { api_key: tmdbKey, language: 'en-US' }));
  const season = await response.json();
  return (season.episodes || []).map((episode: any) => ({
    id: episode.id,
    title: episode.name || `Episode ${episode.episode_number}`,
    episodeNumber: episode.episode_number,
    rating: episode.vote_average ? Number(episode.vote_average).toFixed(1) : '0.0',
    popularity: Math.round(episode.vote_average ? episode.vote_average * 10 : 0),
    poster: buildPosterProxyPath(episode.still_path || season.poster_path),
    desc: episode.overview || 'No description available.',
    mediaType: 'episode',
  }));
};

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
      return res.json({ loggedIn: false, tmd: withTmdStatus() });
    }
    const client = await getClient();
    const isAuth = await client.checkAuthorization();
    res.json({ loggedIn: isAuth, tmd: withTmdStatus() });
  } catch (e) {
    res.json({ loggedIn: false, tmd: withTmdStatus() });
  }
});

app.get('/api/tg/tmd/status', async (req, res) => {
  const status = withTmdStatus();
  res.json(status);
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

      const messageUrl = chat?.username ? `https://t.me/${chat.username}/${m.id}` : '';

      return {
        id: m.id,
        peerId: peerId?.toString(),
        title: title.substring(0, 100) + (title.length > 100 ? '...' : ''),
        chatName: chat ? (chat.title || chat.username || 'Unknown Chat') : 'Unknown Chat',
        messageUrl,
        canUseTmd: Boolean(messageUrl),
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

    const buffer = await client.downloadMedia(message.media);
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
app.get('/api/poster', async (req, res) => {
  try {
    const path = typeof req.query.path === 'string' ? req.query.path : '';
    const size = typeof req.query.size === 'string' ? req.query.size : 'w780';

    if (!path) {
      return res.status(400).send('Missing poster path');
    }

    const posterResponse = await fetch(`${TMDB_IMAGE_BASE}/${size}${path}`);
    if (!posterResponse.ok) {
      return res.status(posterResponse.status).send('Poster not found');
    }

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', posterResponse.headers.get('content-type') || 'image/jpeg');

    const buffer = Buffer.from(await posterResponse.arrayBuffer());
    res.send(buffer);
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

app.post('/api/tg/tmd/download', async (req, res) => {
  try {
    const { messageUrl, title } = req.body || {};
    if (!messageUrl || typeof messageUrl !== 'string') {
      return res.status(400).json({ error: 'Missing messageUrl' });
    }

    if (!isTmdPublicMessageUrl(messageUrl)) {
      return res.status(400).json({ error: 'TMD currently supports only public t.me message links.' });
    }

    const status = withTmdStatus();
    if (!status.enabled) {
      return res.status(400).json({ error: status.reason || 'TMD is not configured' });
    }

    const job = createTmdJob(typeof title === 'string' ? title : 'telegram-video', messageUrl);
    runTmdDownloadJob(job).catch((error) => {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = Date.now();
    });

    res.json({
      jobId: job.id,
      status: job.status,
      provider: 'tmd',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tg/tmd/download/:jobId', async (req, res) => {
  const job = tmdJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'TMD job not found' });
  }

  res.json({
    jobId: job.id,
    status: job.status,
    title: job.title,
    error: job.error,
    streamUrl: job.streamPath,
    provider: 'tmd',
  });
});

app.get('/api/tg/tmd/stream/:jobId', async (req, res) => {
  try {
    const job = tmdJobs.get(req.params.jobId);
    if (!job?.filePath) {
      return res.status(404).send('Downloaded file not found');
    }

    const stats = await fs.stat(job.filePath);
    const range = req.headers.range;
    const contentType = 'video/mp4';

    if (range) {
      const [startText, endText] = range.replace(/bytes=/, '').split('-');
      const start = Number.parseInt(startText, 10);
      const end = endText ? Number.parseInt(endText, 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      });

      const stream = (await import('node:fs')).createReadStream(job.filePath, { start, end });
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': stats.size,
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
    });

    const stream = (await import('node:fs')).createReadStream(job.filePath);
    stream.pipe(res);
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

app.get('/api/remote-image', async (req, res) => {
  try {
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    if (!url) {
      return res.status(400).send('Missing image url');
    }

    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).send('Invalid image url');
    }

    const imageResponse = await fetch(parsedUrl.toString());
    if (!imageResponse.ok) {
      return res.status(imageResponse.status).send('Image not found');
    }

    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', imageResponse.headers.get('content-type') || 'image/jpeg');

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    res.send(buffer);
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

app.get('/api/movies', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (tmdbKey) {
      try {
        const movies = await fetchTmdbCatalog(tmdbKey);
        if (movies.length > 0) {
          return res.json({ movies });
        }
      } catch (error) {
        console.warn('TMDb movie catalog failed, falling back to OMDb:', error);
      }
    }

    const omdbMovies = await fetchOmdbCatalog();
    if (omdbMovies.length > 0) {
      return res.json({ movies: omdbMovies });
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
    res.json({ movies: fallback.map((movie) => withPosterProxyObject(movie)) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/series', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (tmdbKey) {
      try {
        const series = await fetchTmdbSeriesCatalog(tmdbKey);
        if (series.length > 0) {
          return res.json({ series });
        }
      } catch (error) {
        console.warn('TMDb series catalog failed, falling back to TVMaze:', error);
      }
    }

    const series = await fetchTvMazeCatalog();
    if (series.length > 0) {
      return res.json({ series });
    }

    res.json({
      series: FALLBACK_SERIES.map(({ seasons, ...series }) => withPosterProxyObject(series)),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/series/:seriesId/seasons', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (tmdbKey) {
      try {
        const seasons = await fetchTmdbSeasons(tmdbKey, req.params.seriesId);
        if (seasons.length > 0) {
          return res.json({ seasons });
        }
      } catch (error) {
        console.warn('TMDb seasons failed, falling back to TVMaze:', error);
      }
    }

    const seasons = await fetchTvMazeSeasons(req.params.seriesId);
    if (seasons.length > 0) {
      return res.json({ seasons });
    }

    const series = FALLBACK_SERIES.find((item) => String(item.id) === req.params.seriesId);
    if (!series) return res.status(404).json({ error: 'Series not found' });

    res.json({
      seasons: series.seasons.map(({ episodes, ...season }) => withPosterProxyObject(season)),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/series/:seriesId/seasons/:seasonNumber/episodes', async (req, res) => {
  try {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (tmdbKey) {
      try {
        const episodes = await fetchTmdbEpisodes(tmdbKey, req.params.seriesId, req.params.seasonNumber);
        if (episodes.length > 0) {
          return res.json({ episodes });
        }
      } catch (error) {
        console.warn('TMDb episodes failed, falling back to TVMaze:', error);
      }
    }

    const episodes = await fetchTvMazeEpisodes(req.params.seriesId, req.params.seasonNumber);
    if (episodes.length > 0) {
      return res.json({ episodes });
    }

    const series = FALLBACK_SERIES.find((item) => String(item.id) === req.params.seriesId);
    const season = series?.seasons.find((item) => String(item.seasonNumber) === req.params.seasonNumber);
    if (!season) return res.status(404).json({ error: 'Season not found' });

    res.json({
      episodes: season.episodes.map((episode) => withPosterProxyObject(episode)),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/title-info', async (req, res) => {
  try {
    const title = typeof req.query.title === 'string' ? req.query.title : '';
    const year = typeof req.query.year === 'string' ? req.query.year : '';
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    if (!title) return res.status(400).json({ error: 'Missing title' });

    const info = await fetchOmdbTitleInfo(title, year, type);
    if (!info) return res.json({ info: null });

    res.json({ info });
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
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
