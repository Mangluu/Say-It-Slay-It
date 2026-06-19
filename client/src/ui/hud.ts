import { Container, Graphics, Sprite, Text } from "pixi.js";
import * as C from "../config";
import { Match } from "../game/match";
import { loadTex } from "../util/tex";

function lerpCol(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// HUD: a depleting health bar per player (full = green, empty = red, empty -> KO), the
// player's name, the current weapon (sprite + name + ammo), round pips, and the
// center message. Damage % is shown as the bar instead of a number (clearer for a crowd).
export class Hud {
  readonly node = new Container();
  private tagTxt: Text[] = [];
  private itemTxt: Text[] = [];
  private icon: Container[] = [];
  private iconUrl: (string | undefined)[] = [undefined, undefined];
  private bars = new Graphics();
  private pips = new Graphics();
  private top: Text;
  private msg: Text;

  constructor(private accents: number[], private names: string[] = ["P1", "P2"]) {
    const mk = (size: number, weight: string, fill: number) =>
      new Text({ text: "", style: { fontFamily: "Arial Black, Arial", fontSize: size, fontWeight: weight as any, fill } });

    this.node.addChild(this.bars);
    for (let p = 0; p < 2; p++) {
      const tag = mk(24, "900", accents[p]); tag.anchor.set(p === 0 ? 0 : 1, 0);
      tag.text = names[p] || `P${p + 1}`; tag.position.set(p === 0 ? 44 : C.DESIGN_W - 44, 22);
      // weapon row (bottom): sprite icon at the outer edge, name flowing inward
      const it = mk(18, "700", 0xc9cce0); it.anchor.set(p === 0 ? 0 : 1, 0.5); it.position.set(p === 0 ? 92 : C.DESIGN_W - 92, C.DESIGN_H - 30);
      const ic = new Container(); ic.position.set(p === 0 ? 52 : C.DESIGN_W - 52, C.DESIGN_H - 30);
      this.tagTxt.push(tag); this.itemTxt.push(it); this.icon.push(ic);
      this.node.addChild(tag, it, ic);
    }
    this.node.addChild(this.pips);
    this.top = mk(32, "800", 0xffffff); this.top.anchor.set(0.5, 0); this.top.position.set(C.DESIGN_W / 2, 22);
    this.msg = mk(72, "900", 0xffffff); this.msg.anchor.set(0.5); this.msg.position.set(C.DESIGN_W / 2, C.DESIGN_H / 2 - 30);
    this.node.addChild(this.top, this.msg);
  }

  update(m: Match) {
    // health bars (top corners)
    this.bars.clear();
    const BW = 420, BH = 26, by = 52;
    for (let p = 0; p < 2; p++) {
      const h = Math.max(0, 1 - m.fighters[p].percent / C.KO_PERCENT);
      const bx = p === 0 ? 44 : C.DESIGN_W - 44 - BW;
      this.bars.roundRect(bx - 3, by - 3, BW + 6, BH + 6, 7).fill({ color: 0x0a0a12, alpha: 0.6 });
      this.bars.roundRect(bx, by, BW, BH, 5).fill(0x2a2c3e);
      const fw = BW * h;
      if (fw > 1) {
        const fx = p === 0 ? bx : bx + (BW - fw); // p1 depletes toward the centre
        this.bars.roundRect(fx, by, fw, BH, 5).fill(lerpCol(0xf03c3c, 0x6ae06a, h));
      }
      this.bars.roundRect(bx, by, BW, BH, 5).stroke({ width: 2, color: 0xffffff, alpha: 0.18 });
    }

    for (let p = 0; p < 2; p++) {
      const it = m.items[p];
      if (it) {
        this.itemTxt[p].text = `${it.name.slice(0, 22)}  x${m.ammo[p]}`;
        (this.itemTxt[p].style as any).fill = m.ammo[p] <= 2 ? C.COL.yellow : 0xc9cce0;
      } else {
        this.itemTxt[p].text = "NO WEAPON!  SHOUT or MELEE";
        (this.itemTxt[p].style as any).fill = C.COL.red;
      }
      // icon shows the generated sprite if it exists, else the weapon emoji (never both)
      const url = it?.spriteUrl;
      const key = url || (it ? "e:" + it.emoji : undefined);
      if (key !== this.iconUrl[p]) {
        this.iconUrl[p] = key;
        this.icon[p].removeChildren();
        if (url) {
          loadTex(url).then((tex) => {
            if (this.iconUrl[p] !== key) return;
            const s = new Sprite(tex); s.anchor.set(0.5); s.width = s.height = 56;
            this.icon[p].addChild(s);
          }).catch(() => { /* fall back to nothing */ });
        } else if (it) {
          const em = new Text({ text: it.emoji, style: { fontFamily: "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, Arial", fontSize: 40 } });
          em.anchor.set(0.5); this.icon[p].addChild(em);
        }
      }
    }

    const solo = m.mode === "solo";
    this.tagTxt[1].text = this.names[1];
    this.top.visible = solo;
    this.pips.visible = !solo;
    if (solo) {
      this.top.text = `SCORE  ${m.score}        WAVE  ${m.wave}`;
    } else {
      this.pips.clear();
      for (let s = 0; s < 2; s++) {
        for (let p = 0; p < 2; p++) {
          const x = p === 0 ? 64 + s * 26 : C.DESIGN_W - 64 - s * 26;
          this.pips.circle(x, C.DESIGN_H - 152, 8).fill(m.scores[p] > s ? this.accents[p] : 0x3a3d57);
        }
      }
    }
    this.msg.text = m.message;
  }
}
