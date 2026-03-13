import * as THREE from 'three';

class TextureManager {
  private loader: THREE.TextureLoader;
  private cache: Map<string, THREE.Texture>;
  private pending: Map<string, Promise<THREE.Texture>>;

  constructor() {
    this.loader = new THREE.TextureLoader();
    this.loader.setCrossOrigin('anonymous');
    this.cache = new Map();
    this.pending = new Map();
  }

  loadTexture(url: string): Promise<THREE.Texture> {
    if (this.cache.has(url)) {
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
              this.cache.set(url, texture);
              this.pending.delete(url);
              resolve(texture);
            }).catch((err) => {
              console.warn("TextureManager: async decode failed, fallback to sync", err);
              this.cache.set(url, texture);
              this.pending.delete(url);
              resolve(texture);
            });
          } else {
            this.cache.set(url, texture);
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
  
  // Optional: clear cache if memory gets too high
  clearCache() {
      this.cache.forEach(texture => texture.dispose());
      this.cache.clear();
      this.pending.clear();
  }
}

export const textureManager = new TextureManager();
