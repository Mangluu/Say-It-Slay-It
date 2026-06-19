import { Archetype, ArchetypeStats } from "./types";

// Mirrors shared/archetypes.json (the server's source of truth in P3) plus
// knockback tuning. Numbers live ONLY here and on the server, never in the LLM.
// Special effects are sidegrades, not upgrades: total power is roughly equal.
export const ARCHETYPES: Record<Archetype, ArchetypeStats> = {
  heavy_bomb:  { damage: 35, throwCooldown: 1.5,  projectileScale: 1.6, ammo: 4,  trajectory: "lob",    special: "explode",     baseKB: 9, growthKB: 0.14 },
  light_spam:  { damage: 8,  throwCooldown: 0.25, projectileScale: 0.7, ammo: 16, trajectory: "flat",   special: "stagger",     baseKB: 3, growthKB: 0.06 },
  homing_pest: { damage: 12, throwCooldown: 0.7,  projectileScale: 0.8, ammo: 10, trajectory: "homing", special: "homing",      baseKB: 4, growthKB: 0.08 },
  boomerang:   { damage: 18, throwCooldown: 1.0,  projectileScale: 1.0, ammo: 8,  trajectory: "return", special: "return_hit",  baseKB: 5, growthKB: 0.10 },
  scatter:     { damage: 5,  throwCooldown: 1.2,  projectileScale: 0.6, ammo: 8,  trajectory: "spread", special: "multi", pellets: 6, baseKB: 3, growthKB: 0.07 },
  sticky_trap: { damage: 5,  throwCooldown: 0.9,  projectileScale: 1.0, ammo: 9,  trajectory: "place",  special: "slow_zone",   baseKB: 2, growthKB: 0.05 },
  cloud:       { damage: 3,  throwCooldown: 1.3,  projectileScale: 1.6, ammo: 7,  trajectory: "lob",    special: "lingering",   baseKB: 2, growthKB: 0.04 },
};
