import { Container, Graphics } from "pixi.js";
import * as C from "../config";

// Game feel: hitstop (sim freeze), trauma-based screenshake, hit-flash, impact
// particles. Tie all of them to the same hit event so a punch lands as one beat.
interface Part { g: Graphics; vx: number; vy: number; life: number; max: number; }

export class Juice {
  readonly layer = new Container();   // particles, design space
  readonly flashG = new Graphics();   // fullscreen white flash
  hitstop = 0;

  private trauma = 0;
  private flashT = 0;
  private flashDur = 0.08;
  private flashMax = 0.5;
  private parts: Part[] = [];

  constructor() {
    this.flashG.rect(0, 0, C.DESIGN_W, C.DESIGN_H).fill(0xffffff);
    this.flashG.alpha = 0;
  }

  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  freeze(d: number) { this.hitstop = Math.max(this.hitstop, d); }
  doFlash(a = 0.5, dur = 0.08) { this.flashT = dur; this.flashDur = dur; this.flashMax = a; }

  burst(xpx: number, ypx: number, color: number, n = 14, speed = 320) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.3 + Math.random() * 0.7) * speed;
      const life = 0.3 + Math.random() * 0.4;
      const g = new Graphics();
      g.circle(0, 0, 2 + Math.random() * 4).fill(color);
      g.x = xpx; g.y = ypx;
      this.layer.addChild(g);
      this.parts.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life, max: life });
    }
  }

  update(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashG.alpha = Math.max(0, this.flashT / this.flashDur) * this.flashMax;
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.vy += 600 * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.life -= dt;
      p.g.alpha = Math.max(0, p.life / p.max);
      if (p.life <= 0) { p.g.destroy(); this.parts.splice(i, 1); }
    }
  }

  shakeOffset() {
    const s = this.trauma * this.trauma;
    return { x: (Math.random() * 2 - 1) * s * 28, y: (Math.random() * 2 - 1) * s * 28 };
  }
}
