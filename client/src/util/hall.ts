import { ItemSpec } from "../content/types";

// Session log of forged weapons for the Weapon Hall of Fame attract screen.
export interface HallEntry {
  name: string; archetype: string; flavor: string; emoji: string; color: number; spriteUrl?: string;
}

const hall: HallEntry[] = [];
const seen = new Set<string>();

export function record(it: ItemSpec) {
  const k = it.name.toLowerCase();
  if (seen.has(k)) return;
  seen.add(k);
  hall.unshift({ name: it.name, archetype: it.archetype, flavor: it.flavor, emoji: it.emoji, color: it.color, spriteUrl: it.spriteUrl });
  if (hall.length > 60) hall.pop();
}

export function getHall(): HallEntry[] { return hall; }
