// Sound mode: "fun" (the new warmer/juicier system, default) or "classic" (the original
// procedural bleeps, kept as a backup). Persisted so a toggle survives reloads. Both
// Music and Sfx read this; the title menu flips it.
export type SoundMode = "fun" | "classic";

let mode: SoundMode = "fun";
try { if (typeof localStorage !== "undefined" && localStorage.getItem("micdrop_sound") === "classic") mode = "classic"; } catch { /* no storage */ }

export function soundMode(): SoundMode { return mode; }

export function toggleSoundMode(): SoundMode {
  mode = mode === "fun" ? "classic" : "fun";
  try { localStorage.setItem("micdrop_sound", mode); } catch { /* no storage */ }
  return mode;
}
