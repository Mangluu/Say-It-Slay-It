import { InputState, NEUTRAL } from "./types";
import { Controller } from "../game/controller";

// Xbox / standard-mapping gamepad as a Controller. Movement on the left stick (with a
// deadzone) or the d-pad; A = jump, X or RT = throw, B = melee (the 'special' field the
// game already reads), RB or LT = dash. Polled fresh each sample (the Gamepad API is a
// snapshot, not events), which is exactly how Match calls controllers.
//
// IMPORTANT: read the RAW navigator.getGamepads() index, never a compacted/filtered list.
// getGamepads() is a sparse array keyed by the stable per-device gamepad.index; compacting
// it would re-map a surviving pad to the wrong player the moment another pad disconnects.
// The lobby captures each player's concrete index once (game.padIndex) and we read that.
const DEAD = 0.28;

export function gamepadCount(): number {
  if (!navigator.getGamepads) return 0;
  return Array.from(navigator.getGamepads()).filter(Boolean).length;
}

// The connected pads' concrete indices, lowest first (for the lobby to assign players).
export function connectedPadIndices(): number[] {
  if (!navigator.getGamepads) return [];
  const pads = navigator.getGamepads();
  const out: number[] = [];
  for (let i = 0; i < pads.length; i++) if (pads[i]) out.push(i);
  return out;
}

// Buzz one pad (used to signal SHOUT NOW). Tries the modern vibrationActuator, then the
// older hapticActuators pulse; silently no-ops on a pad with no haptics. Never throws.
export function rumblePad(index: number, durationMs: number, strong = 0.5, weak = 0.85): void {
  try {
    if (!navigator.getGamepads) return;
    const pad = navigator.getGamepads()[index] as any;
    if (!pad) return;
    const act = pad.vibrationActuator;
    if (act && typeof act.playEffect === "function") {
      act.playEffect("dual-rumble", { duration: durationMs, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
      return;
    }
    const hap = pad.hapticActuators;
    if (hap && hap[0] && typeof hap[0].pulse === "function") hap[0].pulse(Math.max(strong, weak), durationMs);
  } catch { /* unsupported pad */ }
}

export class GamepadController implements Controller {
  constructor(private padIndex: number) {} // a fixed navigator.getGamepads() index

  sample(): InputState {
    if (!navigator.getGamepads) return NEUTRAL;
    const pad = navigator.getGamepads()[this.padIndex];
    if (!pad) return NEUTRAL; // this player's pad is gone: stand still (never read someone else's)
    const b = (i: number) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    let ax = pad.axes[0] || 0;
    if (Math.abs(ax) < DEAD) ax = 0;
    if (b(14)) ax = -1; else if (b(15)) ax = 1; // d-pad overrides the stick
    return {
      axisX: Math.max(-1, Math.min(1, ax)),
      jump: b(0),                // A
      throw: b(2) || b(7),       // X or right trigger
      special: b(1),             // B = melee
      dash: b(5) || b(6),        // bumpers / left trigger
    };
  }
}
