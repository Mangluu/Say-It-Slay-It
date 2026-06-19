import { Texture } from "pixi.js";

// Load a Texture from any URL, INCLUDING blob: object URLs. Pixi's Assets.load
// keys off the file extension to pick a parser, and blob: URLs have none, so it
// fails on our generated-sprite object URLs. Going through an Image element sidesteps
// that. Cached by URL so repeated throws of the same weapon reuse one texture.
const cache = new Map<string, Promise<Texture>>();

export function loadTex(url: string): Promise<Texture> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<Texture>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(Texture.from(img));
      img.onerror = (e) => reject(e);
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

// Free a generated-sprite texture. Texture.from textures are NOT owned by Pixi Assets,
// so Assets.unload is a no-op on them; we must destroy + forget them ourselves.
export function release(url: string): void {
  const p = cache.get(url);
  if (!p) return;
  cache.delete(url);
  p.then((t) => { try { t.destroy(true); } catch { /* already gone */ } }).catch(() => {});
}
