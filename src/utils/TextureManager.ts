import * as THREE from 'three';

type CachedTextureEntry = {
  texture: THREE.Texture;
  retainCount: number;
  lastUsedAt: number;
};

class TextureManager {
  private loader: THREE.TextureLoader;
  private cache: Map<string, CachedTextureEntry>;
  private pending: Map<string, Promise<THREE.Texture>>;
  private failed: Map<string, number>;
  private idlePrefetchQueue: Set<string>;
  private idlePrefetchTimer: ReturnType<typeof setTimeout> | null;
  private readonly maxCacheSize: number;
  private readonly failureTtlMs: number;

  constructor() {
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin('anonymous');
    this.cache = new Map();
    this.pending = new Map();
    this.failed = new Map();
    this.idlePrefetchQueue = new Set();
    this.idlePrefetchTimer = null;
    this.maxCacheSize = 200;
    this.failureTtlMs = 30_000;
  }

  private logDebug(event: string, details: Record<string, unknown>) {
    if (typeof import.meta !== 'undefined' && (import.meta as ImportMeta & { env?: Record<string, unknown> }).env?.DEV) {
      console.log('TEXTURE_EVENT', { event, ...details });
    }
  }

  private evictIfNeeded() {
    while (this.cache.size > this.maxCacheSize) {
      let oldestKey: string | null = null;
      let oldestUsedAt = Number.POSITIVE_INFINITY;

      this.cache.forEach((entry, key) => {
        if (entry.retainCount > 0) return;
        if (entry.lastUsedAt < oldestUsedAt) {
          oldestUsedAt = entry.lastUsedAt;
          oldestKey = key;
        }
      });

      if (!oldestKey) break;
      const entry = this.cache.get(oldestKey);
      this.cache.delete(oldestKey);
      this.logDebug('evict-cache-entry', {
        url: oldestKey,
        retainCount: entry?.retainCount ?? 0,
        cacheSize: this.cache.size
      });
    }
  }

  private rememberTexture(url: string, texture: THREE.Texture) {
    const existingEntry = this.cache.get(url);
    if (existingEntry) {
      this.cache.delete(url);
    }
    this.cache.set(url, {
      texture,
      retainCount: existingEntry?.retainCount ?? 0,
      lastUsedAt: Date.now()
    });
    this.failed.delete(url);
    this.evictIfNeeded();
    this.logDebug('remember-texture', { url, cacheSize: this.cache.size });
  }

  hasTexture(url: string) {
    return this.cache.has(url);
  }

  getTexture(url: string) {
    if (!this.cache.has(url)) return null;
    this.touchTexture(url);
    return this.cache.get(url)!.texture;
  }

  private touchTexture(url: string) {
    if (!this.cache.has(url)) return;
    const entry = this.cache.get(url)!;
    this.cache.delete(url);
    this.cache.set(url, {
      ...entry,
      lastUsedAt: Date.now()
    });
  }

  retainTexture(url: string) {
    const entry = this.cache.get(url);
    if (!entry) return;
    entry.retainCount += 1;
    entry.lastUsedAt = Date.now();
    this.logDebug('retain-texture', { url, retainCount: entry.retainCount });
  }

  releaseTexture(url: string) {
    const entry = this.cache.get(url);
    if (!entry) return;
    entry.retainCount = Math.max(0, entry.retainCount - 1);
    entry.lastUsedAt = Date.now();
    this.logDebug('release-texture', { url, retainCount: entry.retainCount });
    this.evictIfNeeded();
  }

  loadTexture(url: string): Promise<THREE.Texture> {
    if (this.cache.has(url)) {
      this.touchTexture(url);
      this.logDebug('cache-hit', { url });
      return Promise.resolve(this.cache.get(url)!.texture);
    }

    const failedAt = this.failed.get(url);
    if (failedAt && Date.now() - failedAt < this.failureTtlMs) {
      this.logDebug('failed-cache-hit', { url });
      return Promise.reject(new Error('Texture failed recently'));
    }

    if (this.pending.has(url)) {
      this.logDebug('pending-hit', { url });
      return this.pending.get(url)!;
    }

    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      this.logDebug('load-start', { url });
      this.loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.generateMipmaps = false;
          texture.minFilter = THREE.LinearFilter;
          texture.needsUpdate = true;
          
          if (texture.image && typeof texture.image.decode === 'function') {
            texture.image.decode().then(() => {
              texture.needsUpdate = true;
              this.rememberTexture(url, texture);
              this.pending.delete(url);
              this.logDebug('load-success', { url, decoded: true });
              resolve(texture);
            }).catch((err) => {
              console.warn("TextureManager: async decode failed, fallback to sync", err);
              texture.needsUpdate = true;
              this.rememberTexture(url, texture);
              this.pending.delete(url);
              this.logDebug('load-success', { url, decoded: false });
              resolve(texture);
            });
          } else {
            texture.needsUpdate = true;
            this.rememberTexture(url, texture);
            this.pending.delete(url);
            this.logDebug('load-success', { url, decoded: false });
            resolve(texture);
          }
        },
        undefined,
        (err) => {
          console.error("TextureManager: Failed to load Texture", err);
          this.pending.delete(url);
          this.failed.set(url, Date.now());
          this.logDebug('load-failure', { url, message: err instanceof Error ? err.message : String(err) });
          reject(err);
        }
      );
    });

    this.pending.set(url, promise);
    return promise;
  }

  async prefetch(urls: string[], concurrency = 6) {
    const queue = [...new Set(urls.filter(Boolean))].filter((url) => !this.cache.has(url));
    if (queue.length === 0) return;

    for (let index = 0; index < queue.length; index += concurrency) {
      const batch = queue.slice(index, index + concurrency);
      await Promise.all(batch.map((url) => this.loadTexture(url).catch(() => null)));
    }
  }

  private scheduleIdlePrefetch(concurrency = 2) {
    if (this.idlePrefetchTimer || this.idlePrefetchQueue.size === 0) return;

    const runner = async () => {
      this.idlePrefetchTimer = null;
      const queue = Array.from(this.idlePrefetchQueue);
      this.idlePrefetchQueue.clear();
      await this.prefetch(queue, concurrency);
      if (this.idlePrefetchQueue.size > 0) {
        this.scheduleIdlePrefetch(concurrency);
      }
    };

    this.idlePrefetchTimer = setTimeout(() => {
      void runner();
    }, 120);
  }

  async prefetchPriority(priorityUrls: string[], secondaryUrls: string[] = [], concurrency = 6) {
    const priorityQueue = [...new Set(priorityUrls.filter(Boolean))]
      .filter((url) => !this.cache.has(url));
    const secondaryQueue = [...new Set(secondaryUrls.filter(Boolean))]
      .filter((url) => !this.cache.has(url) && !priorityQueue.includes(url));

    if (priorityQueue.length > 0) {
      await this.prefetch(priorityQueue, Math.max(2, Math.min(concurrency, 4)));
    }

    if (secondaryQueue.length > 0) {
      secondaryQueue.forEach((url) => this.idlePrefetchQueue.add(url));
      this.scheduleIdlePrefetch(Math.max(1, concurrency - 2));
    }
  }

  getStats() {
    return {
      cached: this.cache.size,
      pending: this.pending.size,
      failed: this.failed.size,
      idleQueued: this.idlePrefetchQueue.size,
      maxCacheSize: this.maxCacheSize
    };
  }
  
  // Optional: clear cache if memory gets too high
  clearCache() {
      if (this.idlePrefetchTimer) {
        clearTimeout(this.idlePrefetchTimer);
        this.idlePrefetchTimer = null;
      }
      this.idlePrefetchQueue.clear();
      this.cache.forEach(({ texture }) => texture.dispose());
      this.cache.clear();
      this.pending.clear();
      this.failed.clear();
  }
}

export const textureManager = new TextureManager();
