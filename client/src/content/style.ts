import { Archetype } from "./types";

// Render style per archetype (the LLM never sets these): a tint plus an emoji used
// as the bundled fallback sprite. One source of truth shared by mock + remote, so
// the two content paths can never drift apart.
export const STYLE: Record<Archetype, { color: number; emoji: string }> = {
  heavy_bomb:  { color: 0xffc83a, emoji: "\u{1F4A3}" },
  light_spam:  { color: 0xff77dd, emoji: "✨" },
  homing_pest: { color: 0xf0d000, emoji: "\u{1F41D}" },
  boomerang:   { color: 0x6ad0ff, emoji: "\u{1FA83}" },
  scatter:     { color: 0xff5577, emoji: "\u{1F389}" },
  sticky_trap: { color: 0xff9ad2, emoji: "\u{1F36C}" },
  cloud:       { color: 0x9ad84a, emoji: "\u{1F4A8}" },
};
