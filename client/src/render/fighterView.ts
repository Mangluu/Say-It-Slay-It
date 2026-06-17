import { Container, Graphics } from "pixi.js";
import * as C from "../config";
import { Fighter } from "../game/fighter";

// Animated limbed fighter: run cycle, jump tuck, throw thrust, hit lean, glow.
// Redrawn each frame (cheap for two fighters). Reads only Fighter state.
export class FighterView {
  readonly node = new Container();
  private glow = new Graphics();
  private g = new Graphics();

  constructor(private accent: number) {
    this.node.addChild(this.glow, this.g);
  }

  sync(f: Fighter) {
    this.node.position.set(C.px(f.pos.x), C.sy(f.pos.y - f.halfH)); // feet origin
    this.node.scale.x = f.facing;

    const col = f.flash > 0 ? 0xffffff : this.accent;
    const dark = 0x0a0a12;
    const H = f.halfH * 2 * C.PPM;
    const vx = f.body.getLinearVelocity().x;
    const moving = f.grounded && Math.abs(vx) > 1.0;
    const swing = moving ? Math.sin(f.animT * 11) : 0;
    const airborne = !f.grounded;
    const lean = f.hitstun > 0 || f.flash > 0 ? -6 : 0;

    const hipY = -H * 0.46, shY = -H * 0.84, headY = -H * 0.99;

    this.glow.clear();
    this.glow.ellipse(lean, -H * 0.5, H * 0.42, H * 0.56).fill({ color: this.accent, alpha: 0.16 });
    this.glow.ellipse(0, 0, H * 0.30, 8).fill({ color: 0x000000, alpha: 0.35 });

    const g = this.g; g.clear();
    const limb = (x1: number, y1: number, x2: number, y2: number, w: number, c = col) =>
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: w, color: c, cap: "round" });

    // legs
    if (airborne) {
      limb(lean, hipY, lean - 9, hipY + H * 0.30, 9);
      limb(lean, hipY, lean + 12, hipY + H * 0.30, 9);
    } else {
      const s = swing * 14;
      limb(lean, hipY, lean + s, 0, 9);
      limb(lean, hipY, lean - s, 0, 9);
    }

    // torso + head
    limb(lean, hipY, lean, shY, 12);
    g.circle(lean, headY, H * 0.13).fill(col);
    g.circle(lean, headY, H * 0.13).stroke({ width: 3, color: dark });
    g.circle(lean + H * 0.06, headY - H * 0.01, 3).fill(dark);

    // arms
    if (f.throwTimer > 0) {
      limb(lean, shY, lean + H * 0.36, shY - H * 0.05, 10); // thrust
      limb(lean, shY, lean - 10, shY + H * 0.18, 9);
    } else {
      const a = swing * 12;
      limb(lean, shY, lean + 11 - a, shY + H * 0.22, 9);
      limb(lean, shY, lean - 11 + a, shY + H * 0.22, 9);
    }
  }
}
