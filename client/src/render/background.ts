import { Container, Graphics } from "pixi.js";
import * as C from "../config";

// A living parallax backdrop: gradient sky, drifting glow orbs, a neon grid floor
// with perspective, and a vignette. Pure Graphics, cheap, animated. The orbs + grid
// can be recolored from a webcam-derived palette (applyArena) so the room's colors
// wash over the scene: animated and inspired by the room, never a static picture,
// and never collidable (this is pure decoration behind the stage).
export class Background {
  readonly node = new Container();
  private orbLayer = new Container();
  private orbs: { g: Graphics; x: number; y: number; vx: number; r: number }[] = [];
  private grid = new Graphics();
  private gridColor = C.COL.grid;
  private t = 0;

  constructor() {
    const sky = new Graphics();
    const bands = 48;
    for (let i = 0; i < bands; i++) {
      const k = i / (bands - 1);
      sky.rect(0, (C.DESIGN_H / bands) * i, C.DESIGN_W, C.DESIGN_H / bands + 1).fill(lerp(C.COL.bgTop, C.COL.bgBot, k));
    }
    this.node.addChild(sky);

    this.node.addChild(this.orbLayer);
    this.buildOrbs([0x3c2e6e, 0x2e4e8e, 0x6e2e5e, 0x2e6e6e], 7, 0.16);

    this.node.addChild(this.grid);
    this.drawGrid();

    const vig = new Graphics();
    vig.rect(0, 0, C.DESIGN_W, 90).fill({ color: 0x000000, alpha: 0.35 });
    vig.rect(0, C.DESIGN_H - 90, C.DESIGN_W, 90).fill({ color: 0x000000, alpha: 0.35 });
    this.node.addChild(vig);
  }

  private buildOrbs(palette: number[], count: number, alpha: number) {
    this.orbLayer.removeChildren();
    this.orbs = [];
    for (let i = 0; i < count; i++) {
      const r = 60 + Math.random() * 170;
      const g = new Graphics();
      g.circle(0, 0, r).fill({ color: palette[i % palette.length], alpha });
      const x = Math.random() * C.DESIGN_W;
      const y = 60 + Math.random() * (C.DESIGN_H * 0.55);
      g.position.set(x, y);
      this.orbLayer.addChild(g);
      this.orbs.push({ g, x, y, vx: (Math.random() * 2 - 1) * 8, r });
    }
  }

  // Recolor the living backdrop from a webcam-derived palette. Visual only.
  applyArena(colors: number[]) {
    if (!colors.length) return;
    const pal = colors.map(boost);
    this.buildOrbs(pal, 11, 0.22);
    this.gridColor = lerp(pal[0], C.COL.bgBot, 0.55);
    this.drawGrid();
  }

  private drawGrid() {
    const g = this.grid; g.clear();
    const horizon = C.sy(2);
    for (let i = 1; i <= 8; i++) {
      const y = horizon + Math.pow(i / 8, 2.0) * (C.DESIGN_H - horizon);
      g.moveTo(0, y).lineTo(C.DESIGN_W, y).stroke({ width: 1, color: this.gridColor, alpha: 0.7 });
    }
    const cx = C.DESIGN_W / 2;
    for (let i = -14; i <= 14; i++) {
      g.moveTo(cx + i * 34, horizon).lineTo(cx + i * 120, C.DESIGN_H).stroke({ width: 1, color: this.gridColor, alpha: 0.5 });
    }
  }

  update(dt: number) {
    this.t += dt;
    for (const o of this.orbs) {
      o.x += o.vx * dt;
      if (o.x < -o.r) o.x = C.DESIGN_W + o.r;
      if (o.x > C.DESIGN_W + o.r) o.x = -o.r;
      o.g.x = o.x;
      o.g.y = o.y + Math.sin(this.t * 0.4 + o.r) * 10;
    }
  }
}

// Brighten a (often dark) sampled room color so it reads against the dark sky.
function boost(c: number): number {
  const r = Math.min(255, ((c >> 16) & 255) * 1.35 + 20);
  const g = Math.min(255, ((c >> 8) & 255) * 1.35 + 20);
  const b = Math.min(255, (c & 255) * 1.35 + 20);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function lerp(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
