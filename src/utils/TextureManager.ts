import * as THREE from 'three';

class TextureManager {
  private loader: THREE.TextureLoader;
  private cache: Map<string, THREE.Texture>;
  private pending: Map<string, Promise<THREE.Texture>>;
  private readonly maxCacheSize: number;

  constructor() {
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin('anonymous');
    this.cache = new Map();
    this.pending = new Map();
    this.maxCacheSize = 200;
  }

  private rememberTexture(url: string, texture: THREE.Texture) {
    if (this.cache.has(url)) {
      this.cache.delete(url);
    }
    this.cache.set(url, texture);

    while (this.cache.size > this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      const oldestTexture = this.cache.get(oldestKey);
      oldestTexture?.dispose();
      this.cache.delete(oldestKey);
    }
  }

  hasTexture(url: string) {
    return this.cache.has(url);
  }

  private touchTexture(url: string) {
    if (!this.cache.has(url)) return;
    const texture = this.cache.get(url)!;
    this.cache.delete(url);
    this.cache.set(url, texture);
  }

  loadTexture(url: string): Promise<THREE.Texture> {
    if (this.cache.has(url)) {
      this.touchTexture(url);
      return Promise.resolve(this.cache.get(url)!);
    }
    
    if (this.pending.has(url)) {
      return this.pending.get(url)!;
    }

    const promise = new Promise<THREE.Texture>((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.generateMipmaps = false;
          texture.minFilter = THREE.LinearFilter;
          
          if (texture.image && typeof texture.image.decode === 'function') {
            texture.image.decode().then(() => {
              this.rememberTexture(url, texture);
              this.pending.delete(url);
              resolve(texture);
            }).catch((err) => {
              console.warn("TextureManager: async decode failed, fallback to sync", err);
              this.rememberTexture(url, texture);
              this.pending.delete(url);
              resolve(texture);
            });
          } else {
            this.rememberTexture(url, texture);
            this.pending.delete(url);
            resolve(texture);
          }
        },
        undefined,
        (err) => {
          console.error("TextureManager: Failed to load Texture", err);
          this.pending.delete(url);
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

  async prefetchPriority(priorityUrls: string[], secondaryUrls: string[] = [], concurrency = 6) {
    const queue = [...new Set([...priorityUrls, ...secondaryUrls].filter(Boolean))]
      .filter((url) => !this.cache.has(url));
    if (queue.length === 0) return;
    await this.prefetch(queue, concurrency);
  }
  
  // Optional: clear cache if memory gets too high
  clearCache() {
      this.cache.forEach(texture => texture.dispose());
      this.cache.clear();
      this.pending.clear();
  }
}

export const textureManager = new TextureManager();
