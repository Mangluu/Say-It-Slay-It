// The content layer. The LLM (P3) only ever fills the string/enum fields of an
// ItemSpec; the numeric `stats` are stamped from the archetype table (the
// fairness firewall). The game talks only to ContentProvider, so Mock <-> Local
// is a one-line swap.
export type Archetype =
  | "heavy_bomb" | "light_spam" | "homing_pest" | "boomerang"
  | "scatter" | "sticky_trap" | "cloud";

export interface ArchetypeStats {
  damage: number;
  throwCooldown: number;
  projectileScale: number;
  ammo: number;
  trajectory: "lob" | "flat" | "homing" | "return" | "spread" | "place";
  special: string;
  pellets?: number;
  baseKB: number;   // base knockback (server-owned)
  growthKB: number; // knockback growth with victim percent (server-owned)
}

export interface ItemSpec {
  id: string;
  name: string;
  archetype: Archetype;
  flavor: string;
  voiceBark: string;
  visualPrompt: string;
  color: number; // render tint until a real sprite exists (P5)
  emoji: string;
  stats: ArchetypeStats;
  spriteUrl?: string; // set async by LocalProvider once SD-Turbo art is ready (P5)
  effect?: "freeze" | "burn" | "shock"; // on-hit status derived from the words you shouted (P12)
}

export interface ContentProvider {
  forgeItem(phrase: string, playerId: number): Promise<ItemSpec>;
}
