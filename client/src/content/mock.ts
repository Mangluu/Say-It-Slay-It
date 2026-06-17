import { ContentProvider, ItemSpec } from "./types";
import { ARCHETYPES } from "./archetypes";

// Curated fallback pool: instant, no models. Also the showcase "safe mode"
// source and the P0/P1 content. Funny names, fixed (fair) stats by archetype.
type PoolEntry = Pick<ItemSpec, "name" | "archetype" | "flavor" | "voiceBark" | "visualPrompt" | "color" | "emoji">;

const POOL: PoolEntry[] = [
  { name: "Flaming Rubber Duck", archetype: "heavy_bomb",  flavor: "Quacks once, then detonates.", voiceBark: "QUACK. BOOM.", visualPrompt: "a flaming rubber duck", color: 0xffc83a, emoji: "\u{1F986}" },
  { name: "Glitter Machine Gun", archetype: "light_spam",  flavor: "Fabulous and relentless.",     voiceBark: "SPARKLE",      visualPrompt: "a glitter machine gun", color: 0xff77dd, emoji: "✨" },
  { name: "Angry Wasp Jar",      archetype: "homing_pest", flavor: "It knows where you live.",      voiceBark: "BZZZZ",        visualPrompt: "a jar of angry wasps", color: 0xf0d000, emoji: "\u{1F41D}" },
  { name: "Cursed Frisbee",      archetype: "boomerang",   flavor: "Always comes back. Sorry.",     voiceBark: "WHOOSH",       visualPrompt: "a glowing cursed frisbee", color: 0x6ad0ff, emoji: "\u{1F94F}" },
  { name: "Confetti Cannon",     archetype: "scatter",     flavor: "Celebrate. Violently.",         voiceBark: "TA-DA",        visualPrompt: "a colorful confetti cannon", color: 0xff5577, emoji: "\u{1F389}" },
  { name: "Bubblegum Mine",      archetype: "sticky_trap", flavor: "Step in it. Regret it.",        voiceBark: "SPLAT",        visualPrompt: "a pink bubblegum mine", color: 0xff9ad2, emoji: "\u{1F36C}" },
  { name: "Fart Cloud Deluxe",   archetype: "cloud",       flavor: "Lingers. Like a bad opinion.",  voiceBark: "PFFFT",        visualPrompt: "a green stink cloud", color: 0x9ad84a, emoji: "\u{1F4A8}" },
  { name: "Grandma's Fruitcake", archetype: "heavy_bomb",  flavor: "Dense enough to be a war crime.", voiceBark: "THUNK",      visualPrompt: "a heavy fruitcake brick", color: 0xc08a4a, emoji: "\u{1F370}" },
  { name: "Rubber Chicken SMG",  archetype: "light_spam",  flavor: "Squeaks with every shot.",      voiceBark: "SQUEAK",       visualPrompt: "a rubber chicken gun", color: 0xffe14a, emoji: "\u{1F414}" },
  { name: "Homesick Boomerang",  archetype: "boomerang",   flavor: "Misses you already.",           voiceBark: "WHIRR",        visualPrompt: "a wooden boomerang with eyes", color: 0xb98a52, emoji: "\u{1FA83}" },
];

let counter = 0;

export class MockProvider implements ContentProvider {
  async forgeItem(_phrase: string, _playerId: number): Promise<ItemSpec> {
    const base = POOL[(Math.random() * POOL.length) | 0];
    return { ...base, id: `itm_${counter++}`, stats: ARCHETYPES[base.archetype] };
  }
}
