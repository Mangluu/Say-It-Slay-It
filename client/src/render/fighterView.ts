import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import * as C from "../config";
import { Fighter } from "../game/fighter";

export interface FighterProfile { username?: string; headTex?: Texture; }

// Animated fighter: tapered silhouette, 2-tone (or selfie) head, run cycle, jump
// tuck, throw thrust, melee shove, hit lean, rim glow, contact shadow, and a
// velocity-driven squash/stretch. The head + name tag are persistent child nodes
// (not redrawn each frame), so an optional selfie texture can ride on top. Reads
// only Fighter state; cheap enough to redraw the limbs every frame for two fighters.
export class FighterView {
  readonly node = new Container();
  private glow = new Graphics();
  private g = new Graphics();
  private head?: Sprite;
  private name?: Text;
  private sqx = 1;
  private sqy = 1;

  constructor(private accent: number, profile?: FighterProfile) {
    this.node.addChild(this.glow, this.g);
    if (profile?.headTex) {
      this.head = new Sprite(profile.headTex);
      this.head.anchor.set(0.5);
      this.node.addChild(this.head);
    }
    const label = profile?.username?.trim();
    if (label) {
      this.name = new Text({
        text: label.slice(0, 12),
        style: { fontFamily: "Arial Black, Arial", fontSize: 16, fontWeight: "900", fill: accent, stroke: { color: 0x0a0a12, width: 4 } },
      });
      this.name.anchor.set(0.5);
      this.node.addChild(this.name);
    }
  }

  sync(f: Fighter) {
    this.node.position.set(C.px(f.pos.x), C.sy(f.pos.y - f.halfH * f.size)); // feet origin (scaled by damage-shrink)

    // squash / stretch eased toward a velocity-driven target (feet stay planted)
    const vy = f.body.getLinearVelocity().y;
    const tgtY = f.grounded ? 1 : vy > 1 ? 1.08 : vy < -1 ? 0.93 : 1;
    const tgtX = f.grounded ? 1 : vy > 1 ? 0.95 : 1.05;
    this.sqy += (tgtY - this.sqy) * 0.25;
    this.sqx += (tgtX - this.sqx) * 0.25;
    this.node.scale.set(f.facing * this.sqx, this.sqy);

    const col = f.flash > 0 ? 0xffffff : this.accent;
    const dark = 0x0a0a12;
    const H = f.halfH * 2 * C.PPM * f.size; // body shrinks with damage
    const vx = f.body.getLinearVelocity().x;
    const moving = f.grounded && Math.abs(vx) > 1.0;
    const swing = moving ? Math.sin(f.animT * 11) : 0;
    const airborne = !f.grounded;
    const lean = f.hitstun > 0 || f.flash > 0 ? -6 : 0;

    const hipY = -H * 0.46, shY = -H * 0.84, headY = -H * 1.04;

    this.glow.clear();
    this.glow.ellipse(lean, -H * 0.5, H * 0.40, H * 0.58).fill({ color: this.accent, alpha: 0.18 }); // aura
    this.glow.ellipse(0, 0, H * 0.30, 8).fill({ color: 0x000000, alpha: 0.35 });                     // contact shadow

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

    // tapered torso silhouette (wider shoulders) + a dark waist accent
    g.poly([lean - H * 0.13, hipY, lean + H * 0.13, hipY, lean + H * 0.17, shY, lean - H * 0.17, shY]).fill(col);
    g.moveTo(lean - H * 0.12, hipY).lineTo(lean + H * 0.12, hipY).stroke({ width: 3, color: dark, alpha: 0.5 });
    limb(lean, shY, lean, headY + H * 0.12, 8); // neck

    // head: selfie sprite if present, else a 2-tone procedural head
    if (this.head) {
      this.head.position.set(lean, headY);
      this.head.width = this.head.height = H * 0.46;
    } else {
      g.circle(lean, headY, H * 0.15).fill(col);
      g.circle(lean, headY, H * 0.15).stroke({ width: 3, color: dark });
      g.circle(lean - H * 0.05, headY - H * 0.06, H * 0.045).fill({ color: 0xffffff, alpha: 0.5 }); // rim highlight
      g.circle(lean + H * 0.06, headY - H * 0.01, 3).fill(dark);                                     // eye
    }

    // arms
    if (f.meleeTimer > 0) {
      limb(lean, shY, lean + H * 0.42, shY + H * 0.05, 11); // both palms shove forward
      limb(lean, shY, lean + H * 0.34, shY + H * 0.17, 10);
    } else if (f.throwTimer > 0) {
      limb(lean, shY, lean + H * 0.36, shY - H * 0.05, 10); // thrust
      limb(lean, shY, lean - 10, shY + H * 0.18, 9);
    } else {
      const a = swing * 12;
      limb(lean, shY, lean + 11 - a, shY + H * 0.22, 9);
      limb(lean, shY, lean - 11 + a, shY + H * 0.22, 9);
    }

    // name tag above the head, counter-scaled so it never mirrors when facing left
    if (this.name) {
      this.name.position.set(lean, headY - H * 0.34);
      this.name.scale.set(f.facing, 1);
    }
  }
}
