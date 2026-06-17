import { InputState } from "../input/types";
import { KeyboardSource } from "../input/keyboard";
import { Fighter } from "./fighter";
import { Projectile } from "./projectile";

// A Controller turns world state into an InputState for one fighter. Lets the
// Match treat human (keyboard/phone) and CPU uniformly.
export interface Controller {
  sample(self: Fighter, foe: Fighter, projectiles: Projectile[], dt: number): InputState;
}

export class KeyboardController implements Controller {
  constructor(private kb: KeyboardSource, private index: number) {}
  sample(): InputState { return this.kb.sample(this.index); }
}
