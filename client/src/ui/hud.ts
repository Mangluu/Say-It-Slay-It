import { Container, Graphics, Text } from "pixi.js";
import * as C from "../config";
import { Match } from "../game/match";

function percentColor(pct: number): number {
  const t = Math.min(1, pct / 150);
  return (255 << 16) | (Math.round(255 - 175 * t) << 8) | Math.round(255 - 255 * Math.min(1, t * 1.3));
}

export class Hud {
  readonly node = new Container();
  private pctVal: Text[] = [];
  private tagTxt: Text[] = [];
  private itemTxt: Text[] = [];
  private pips = new Graphics();
  private top: Text;
  private msg: Text;

  constructor(private accents: number[]) {
    const mk = (size: number, weight: string, fill: number) =>
      new Text({ text: "", style: { fontFamily: "Arial Black, Arial", fontSize: size, fontWeight: weight as any, fill } });

    for (let p = 0; p < 2; p++) {
      const baseX = p === 0 ? 150 : C.DESIGN_W - 150;
      const val = mk(76, "900", 0xffffff); val.anchor.set(0.5); val.position.set(baseX, C.DESIGN_H - 84);
      const tag = mk(22, "700", accents[p]); tag.anchor.set(0.5); tag.text = `P${p + 1}`; tag.position.set(baseX, C.DESIGN_H - 140);
      const it = mk(19, "700", 0xc9cce0); it.anchor.set(0.5); it.position.set(baseX, C.DESIGN_H - 30);
      this.pctVal.push(val); this.tagTxt.push(tag); this.itemTxt.push(it);
      this.node.addChild(val, tag, it);
    }
    this.node.addChild(this.pips);
    this.top = mk(32, "800", 0xffffff); this.top.anchor.set(0.5, 0); this.top.position.set(C.DESIGN_W / 2, 22);
    this.msg = mk(72, "900", 0xffffff); this.msg.anchor.set(0.5); this.msg.position.set(C.DESIGN_W / 2, C.DESIGN_H / 2 - 30);
    this.node.addChild(this.top, this.msg);
  }

  update(m: Match) {
    for (let p = 0; p < 2; p++) {
      const f = m.fighters[p];
      this.pctVal[p].text = `${Math.round(f.percent)}%`;
      (this.pctVal[p].style as any).fill = percentColor(f.percent);
      const it = m.items[p];
      this.itemTxt[p].text = it ? `${it.emoji} ${it.name}  x${m.ammo[p]}` : "forging...";
    }
    const solo = m.mode === "solo";
    this.tagTxt[1].text = solo ? "CPU" : "P2";
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
