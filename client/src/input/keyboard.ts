import { InputSource, InputState } from "./types";

// P1: A/D move, W jump, F throw, G dash, T special
// P2: Arrows move/jump, Comma throw, Period dash, Slash special
const MAPS = [
  { left: "KeyA", right: "KeyD", jump: "KeyW", throw: "KeyF", dash: "KeyG", special: "KeyT" },
  { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", throw: "Comma", dash: "Period", special: "Slash" },
];

export class KeyboardSource implements InputSource {
  readonly id = "keyboard";
  private down = new Set<string>();
  private onDown = (e: KeyboardEvent) => {
    this.down.add(e.code);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
  };
  private onUp = (e: KeyboardEvent) => this.down.delete(e.code);

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
  }

  sample(playerIndex: number): InputState {
    const m = MAPS[playerIndex] ?? MAPS[0];
    const d = this.down;
    return {
      axisX: (d.has(m.right) ? 1 : 0) - (d.has(m.left) ? 1 : 0),
      jump: d.has(m.jump),
      throw: d.has(m.throw),
      dash: d.has(m.dash),
      special: d.has(m.special),
    };
  }

  dispose() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
  }
}
