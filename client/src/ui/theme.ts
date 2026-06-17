import { Text, Container, Graphics } from "pixi.js";
import * as C from "../config";

export const FONT = "Arial Black, Arial, sans-serif";

export function mkText(str: string, size: number, fill: number = C.COL.white, weight = "900"): Text {
  const t = new Text({ text: str, style: { fontFamily: FONT, fontSize: size, fontWeight: weight as any, fill, align: "center" } });
  return t;
}

// Keyboard + pointer menu used across the title/results/leaderboard scenes.
export class Menu {
  readonly node = new Container();
  private idx = 0;
  private items: { onSelect: () => void; cont: Container; txt: Text }[] = [];

  constructor(labels: { label: string; onSelect: () => void }[], x: number, y: number, gap = 66) {
    labels.forEach((l, i) => {
      const cont = new Container();
      const txt = mkText(l.label, 36);
      txt.anchor.set(0.5);
      cont.addChild(txt);
      cont.position.set(x, y + i * gap);
      cont.eventMode = "static";
      cont.cursor = "pointer";
      cont.on("pointerover", () => { this.idx = i; this.refresh(); });
      cont.on("pointertap", () => l.onSelect());
      this.items.push({ onSelect: l.onSelect, cont, txt });
      this.node.addChild(cont);
    });
    this.refresh();
  }

  move(d: number) { this.idx = (this.idx + d + this.items.length) % this.items.length; this.refresh(); }
  confirm() { this.items[this.idx]?.onSelect(); }

  private refresh() {
    this.items.forEach((it, i) => {
      const sel = i === this.idx;
      (it.txt.style as any).fill = sel ? C.COL.yellow : C.COL.white;
      it.cont.scale.set(sel ? 1.14 : 1.0);
    });
  }
}
