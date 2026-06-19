// Bundled fallback: map a spoken phrase to a recognizable emoji, so even with zero
// AI (mock pool, safe mode, or no GPU) the thrown weapon still reads as the thing
// you said. Each entry is checked as a substring of the lowercased phrase; the
// first match wins, so order more-specific words before generic ones.
const NOUN_EMOJI: Array<[string, string]> = [
  ["rubber duck", "\u{1F986}"],
  ["keyboard", "⌨️"],
  ["laptop", "\u{1F4BB}"],
  ["computer", "\u{1F4BB}"],
  ["phone", "\u{1F4F1}"],
  ["banana", "\u{1F34C}"],
  ["pickle", "\u{1F952}"],
  ["fish", "\u{1F41F}"],
  ["brick", "\u{1F9F1}"],
  ["chair", "\u{1FA91}"],
  ["duck", "\u{1F986}"],
  ["chicken", "\u{1F414}"],
  ["cat", "\u{1F431}"],
  ["dog", "\u{1F436}"],
  ["snake", "\u{1F40D}"],
  ["frog", "\u{1F438}"],
  ["bee", "\u{1F41D}"],
  ["wasp", "\u{1F41D}"],
  ["spider", "\u{1F577}️"],
  ["flam", "\u{1F525}"],
  ["fire", "\u{1F525}"],
  ["ice", "\u{1F9CA}"],
  ["rock", "\u{1FAA8}"],
  ["stone", "\u{1FAA8}"],
  ["hammer", "\u{1F528}"],
  ["axe", "\u{1FA93}"],
  ["sword", "\u{1F5E1}️"],
  ["knife", "\u{1F52A}"],
  ["gun", "\u{1F52B}"],
  ["bomb", "\u{1F4A3}"],
  ["rocket", "\u{1F680}"],
  ["star", "⭐"],
  ["poop", "\u{1F4A9}"],
  ["fart", "\u{1F4A8}"],
  ["pizza", "\u{1F355}"],
  ["donut", "\u{1F369}"],
  ["cake", "\u{1F370}"],
  ["taco", "\u{1F32E}"],
  ["burger", "\u{1F354}"],
  ["hotdog", "\u{1F32D}"],
  ["egg", "\u{1F95A}"],
  ["shoe", "\u{1F45F}"],
  ["boot", "\u{1F97E}"],
  ["book", "\u{1F4DA}"],
  ["toilet", "\u{1F6BD}"],
  ["skull", "\u{1F480}"],
  ["ghost", "\u{1F47B}"],
  ["bone", "\u{1F9B4}"],
  ["wrench", "\u{1F527}"],
  ["magnet", "\u{1F9F2}"],
  ["balloon", "\u{1F388}"],
  ["umbrella", "☂️"],
  ["cactus", "\u{1F335}"],
  ["guitar", "\u{1F3B8}"],
  ["trumpet", "\u{1F3BA}"],
  ["drum", "\u{1F941}"],
  ["baby", "\u{1F476}"],
  ["trophy", "\u{1F3C6}"],
  ["crown", "\u{1F451}"],
  ["sock", "\u{1F9E6}"],
];

export function nounEmoji(phrase: string): string | undefined {
  if (!phrase) return undefined;
  const s = phrase.toLowerCase();
  for (const [k, e] of NOUN_EMOJI) if (s.includes(k)) return e;
  return undefined;
}

// On-hit status effect inferred from the words you shouted: say something icy and it
// freezes, fiery and it burns, electric and it shocks. Deterministic + bounded, so
// the fairness firewall holds (no LLM-controlled numbers).
const EFFECT_WORDS: Array<[string, "freeze" | "burn" | "shock"]> = [
  ["ice", "freeze"], ["frost", "freeze"], ["freez", "freeze"], ["frozen", "freeze"], ["snow", "freeze"], ["cold", "freeze"], ["glaci", "freeze"], ["icicle", "freeze"],
  ["fire", "burn"], ["flame", "burn"], ["flam", "burn"], ["burn", "burn"], ["lava", "burn"], ["magma", "burn"], ["inferno", "burn"], ["molten", "burn"], ["blaze", "burn"], ["hot", "burn"],
  ["shock", "shock"], ["electr", "shock"], ["thunder", "shock"], ["lightning", "shock"], ["zap", "shock"], ["volt", "shock"], ["taser", "shock"], ["plasma", "shock"],
];

export function weaponEffect(text: string): "freeze" | "burn" | "shock" | undefined {
  if (!text) return undefined;
  const s = text.toLowerCase();
  for (const [k, e] of EFFECT_WORDS) if (s.includes(k)) return e;
  return undefined;
}
