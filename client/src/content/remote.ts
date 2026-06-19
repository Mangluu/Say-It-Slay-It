import { ContentProvider, ItemSpec, Archetype } from "./types";
import { ARCHETYPES } from "./archetypes";
import { MockProvider } from "./mock";
import { STYLE } from "./style";
import { nounEmoji, weaponEffect } from "./nouns";
import { release } from "../util/tex";
import { API } from "../net/config";

// Object URLs for generated sprites, tracked so a long booth session can free them.
// Doubles as a session "sprite library": a weapon whose own sprite fails to generate
// borrows a previously-generated one (looks like a real weapon, not a flat emoji).
const spriteUrls = new Set<string>();

export function borrowSprite(): string | undefined {
  if (spriteUrls.size === 0) return undefined;
  const arr = [...spriteUrls];
  return arr[(Math.random() * arr.length) | 0];
}

export class LocalProvider implements ContentProvider {
  private fallback = new MockProvider();

  async forgeItem(phrase: string, playerId: number): Promise<ItemSpec> {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 25000); // the in-game LLM can be slow; user is fine waiting
      const r = await fetch(`${API}/forge/item`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phrase, playerId }),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!r.ok) throw new Error("bad status");
      const d = await r.json();
      const arch: Archetype = (d.archetype in ARCHETYPES) ? d.archetype : "light_spam";
      const st = STYLE[arch];
      const item: ItemSpec = {
        id: `itm_${Math.random().toString(36).slice(2, 8)}`,
        name: d.name || "Mystery Weapon",
        archetype: arch,
        flavor: d.flavor || "",
        voiceBark: d.voiceBark || "",
        visualPrompt: d.visualPrompt || d.name || "",
        color: st.color,
        emoji: nounEmoji(phrase) || st.emoji,
        stats: ARCHETYPES[arch],
        effect: weaponEffect(`${d.name || ""} ${d.visualPrompt || ""} ${phrase}`),
      };
      // Fire-and-forget AI sprite (SD-Turbo). Never blocks the forge; the item shows
      // its emoji until the PNG arrives, then swaps in-game. Use the LLM's cleaned
      // single-object visualPrompt: the raw spoken phrase is often garbled by ASR
      // ("No. Most. Most"), which makes a nonsense sprite.
      const spritePrompt = (item.visualPrompt || item.name || phrase || "").trim();
      // if this weapon's own sprite fails to generate, borrow a previously-generated one
      // (instead of falling back to the flat emoji).
      void fetchSprite(spritePrompt).then((url) => { item.spriteUrl = url || borrowSprite(); });
      return item;
    } catch {
      const item = await this.fallback.forgeItem(phrase, playerId); // safe-mode fallback
      if (!item.spriteUrl) item.spriteUrl = borrowSprite();
      return item;
    }
  }
}

async function fetchSprite(prompt: string): Promise<string | undefined> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 30000); // gen can be slow; non-blocking anyway
    const r = await fetch(`${API}/forge/sprite`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }), signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!r.ok || r.status === 204) return undefined;
    const blob = await r.blob();
    if (blob.size < 200) return undefined;
    const url = URL.createObjectURL(blob);
    spriteUrls.add(url);
    return url;
  } catch { return undefined; }
}

// Object URLs + GPU textures for generated sprites would otherwise pile up over a
// long booth session (each unique weapon = one blob + one texture). Call this when
// a new forge beat starts to free the previous arsenal's art. Safe because every
// item gets a fresh URL, so nothing in the new match can collide with a freed one.
export function releaseAllSprites(): void {
  for (const url of spriteUrls) {
    release(url);              // destroy the GPU texture + drop the cache entry
    URL.revokeObjectURL(url);  // free the blob
  }
  spriteUrls.clear();
}
