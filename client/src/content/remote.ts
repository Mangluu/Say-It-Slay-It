import { ContentProvider, ItemSpec, Archetype } from "./types";
import { ARCHETYPES } from "./archetypes";
import { MockProvider } from "./mock";

// Render style per archetype (the LLM never sets these). Stats are stamped from
// the shared archetype table client-side = the fairness firewall.
const STYLE: Record<Archetype, { color: number; emoji: string }> = {
  heavy_bomb:  { color: 0xffc83a, emoji: "\u{1F4A3}" },
  light_spam:  { color: 0xff77dd, emoji: "✨" },
  homing_pest: { color: 0xf0d000, emoji: "\u{1F41D}" },
  boomerang:   { color: 0x6ad0ff, emoji: "\u{1FA83}" },
  scatter:     { color: 0xff5577, emoji: "\u{1F389}" },
  sticky_trap: { color: 0xff9ad2, emoji: "\u{1F36C}" },
  cloud:       { color: 0x9ad84a, emoji: "\u{1F4A8}" },
};

// Desktop client + backend run on the same machine. Use 127.0.0.1 (not
// "localhost") so we hit IPv4 directly — on Windows "localhost" can resolve to
// IPv6 ::1, which uvicorn's 0.0.0.0 bind does not listen on. (Phones in P4 hit
// the LAN IP via the backend-served page.)
const API = (import.meta as any).env?.VITE_API || "http://127.0.0.1:8000";

export class LocalProvider implements ContentProvider {
  private fallback = new MockProvider();

  async forgeItem(phrase: string, playerId: number): Promise<ItemSpec> {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
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
        emoji: st.emoji,
        stats: ARCHETYPES[arch],
      };
      // Fire-and-forget AI sprite (SD-Turbo). Never blocks the forge; the item
      // shows its colour until the PNG arrives, then swaps in-game.
      void fetchSprite(item.visualPrompt).then((url) => { if (url) item.spriteUrl = url; });
      return item;
    } catch {
      return this.fallback.forgeItem(phrase, playerId); // safe-mode fallback
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
    return URL.createObjectURL(blob);
  } catch { return undefined; }
}
